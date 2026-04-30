import fastify, { FastifyInstance, FastifySchema } from "fastify";
import fastifySwagger from "@fastify/swagger";
import ScalarApiReference from "@scalar/fastify-api-reference";
import fastifyCors from "@fastify/cors";
import fastifyRateLimit from "@fastify/rate-limit";
import { randomUUID } from "crypto";
import "./auth/middleware";
import { healthRoutes } from "./health/routes";
import { createAuthRoutes } from "./auth/routes";
import { DrizzleAuthRepository } from "./auth/repository";
import { AuthService } from "./auth/service";
import { createTaskRoutes } from "./tasks/routes";
import { DrizzleTaskRepository } from "./tasks/repository";
import { TaskService } from "./tasks/service";

const isDev = process.env.NODE_ENV !== "production";

export function createServer(): FastifyInstance {
  const server = fastify({
    logger: {
      level: isDev ? "debug" : "info",
      transport: isDev
        ? { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard" } }
        : undefined,
      redact: {
        paths: ["req.headers.authorization", "req.body.password", "req.body.refreshToken", "req.body.accessToken"],
        censor: "**redacted**",
      },
    },
  });

  server.addHook("onRequest", async (request) => {
    request.id = request.headers["x-request-id"]?.toString() ?? randomUUID();
    request.log.info({
      method: request.method,
      url: request.url,
      remoteAddress: request.ip,
    }, "incoming request");
  });

  server.setErrorHandler((error, request, reply) => {
    const isProd = process.env.NODE_ENV === "production";
    const statusCode = (error as any).statusCode ?? 500;
    const message = isProd && statusCode >= 500 ? "An unexpected error occurred" : String((error as any).message || "Internal Server Error");
    const errorLabel = statusCode >= 400 && statusCode < 500 ? String((error as any).message) : "Internal Server Error";

    const baseResponse: Record<string, unknown> = {
      error: errorLabel,
      message,
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };

    if (isDev && error instanceof Error && error.stack) {
      baseResponse.stack = error.stack;
    }

    if (statusCode >= 500) {
      request.log.error({ err: error, requestId: request.id }, "unhandled error");
    } else {
      request.log.warn({ err: error, statusCode, requestId: request.id }, "client error");
    }

    return reply.status(statusCode).send(baseResponse);
  });

  // Set up zod schema validator compiler
  server.setValidatorCompiler(({ schema }) => {
    if (schema && typeof schema === "object" && "parse" in schema) {
      return (data: unknown) => {
        try {
          return { value: (schema as { parse: (d: unknown) => unknown }).parse(data) };
        } catch (error: unknown) {
          return {
            error: error instanceof Error ? error : new Error(String(error)),
          };
        }
      };
    }
    return (data: unknown) => ({ value: data });
  });

  // CORS configuration
  const allowedOrigins = process.env.ALLOWED_ORIGINS;
  server.register(fastifyCors, {
    origin: allowedOrigins
      ? allowedOrigins.split(",").map((o) => o.trim())
      : true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-request-id"],
    exposedHeaders: ["x-request-id"],
    credentials: true,
    maxAge: 86400,
  });

  // Rate limiting — two tiers (disabled in test environment)
  if (!process.env.VITEST) {
    server.register(fastifyRateLimit, {
      max: 100,
      timeWindow: "1 minute",
      keyGenerator: (request) => request.ip,
      errorResponseBuilder: (request, context) => ({
        error: "Too Many Requests",
        message: `Rate limit exceeded. Try again in ${Math.ceil(Number(String(context.after).replace("s", "")) * 1000)}s.`,
        requestId: request.id,
        timestamp: new Date().toISOString(),
      }),
    });

    // Apply stricter rate limit to auth routes
    server.addHook("onRoute", (routeOptions) => {
      if (routeOptions.url?.startsWith("/auth")) {
        routeOptions.config = { ...routeOptions.config, rateLimit: { max: 10, timeWindow: "1 minute" } };
      }
    });
  }

  // Register Swagger to generate OpenAPI spec
  server.register(fastifySwagger, {
    openapi: {
      openapi: "3.0.3",
      info: {
        title: "Task Manager API",
        description: "Full-featured task management REST API with user authentication, role-based access control, and JWT tokens.",
        version: "1.0.0",
      },
      servers: [
        {
          url: `http://localhost:${process.env.PORT || 3000}`,
          description: "Local development server",
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description: "Enter your access token (from /auth/login or /auth/register)",
          },
        },
      },
    },
    transform: ({ schema, url }) => {
      const jsonSchema: FastifySchema = { ...schema };
      if (jsonSchema.body && typeof (jsonSchema.body as any).toJSONSchema === "function") {
        (jsonSchema as any).body = (jsonSchema.body as any).toJSONSchema();
      }
      if (jsonSchema.querystring && typeof (jsonSchema.querystring as any).toJSONSchema === "function") {
        (jsonSchema as any).querystring = (jsonSchema.querystring as any).toJSONSchema();
      }
      if (jsonSchema.params && typeof (jsonSchema.params as any).toJSONSchema === "function") {
        (jsonSchema as any).params = (jsonSchema.params as any).toJSONSchema();
      }
      if (jsonSchema.headers && typeof (jsonSchema.headers as any).toJSONSchema === "function") {
        (jsonSchema as any).headers = (jsonSchema.headers as any).toJSONSchema();
      }
      if (jsonSchema.response) {
        for (const key of Object.keys(jsonSchema.response)) {
          const resp = (jsonSchema.response as Record<string, unknown>)[key];
          if (resp && typeof (resp as any).toJSONSchema === "function") {
            (jsonSchema.response as Record<string, unknown>)[key] = (resp as any).toJSONSchema();
          }
        }
      }
      return { schema: jsonSchema, url };
    },
  });

  // Register Scalar UI to serve OpenAPI docs at /docs
  server.register(ScalarApiReference, {
    routePrefix: "/docs",
    configuration: {
      title: "Task Manager API",
      url: "/openapi.json",
    },
  });

  // Expose OpenAPI spec for Scalar to consume
  server.get("/openapi.json", { schema: { hide: true } }, async () => {
    return server.swagger();
  });

  // Auth layer
  const authRepository = new DrizzleAuthRepository();
  const authService = new AuthService(authRepository);

  // Task layer
  const taskRepository = new DrizzleTaskRepository();
  const taskService = new TaskService(taskRepository);

  // Register route plugins
  server.register(healthRoutes);
  server.register(createAuthRoutes(authService));
  server.register(createTaskRoutes(taskService, authService));

  return server;
}

export const server = createServer();

const PORT = Number(process.env.PORT) || 3000;

// Only start server if run directly (not imported for tests)
if (require.main === module) {
  const start = async () => {
    try {
      await server.listen({ port: PORT, host: "0.0.0.0" });
      server.log.info(`Server listening on http://0.0.0.0:${PORT}`);
      server.log.info(`API docs: http://0.0.0.0:${PORT}/docs`);
      server.log.info(`OpenAPI spec: http://0.0.0.0:${PORT}/openapi.json`);
    } catch (err) {
      server.log.error(err);
      process.exit(1);
    }
  };

  start();

  // Graceful shutdown
  const shutdown = async () => {
    server.log.info("Shutting down gracefully...");
    await server.close();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
