import fastify, { FastifyInstance, FastifySchema } from "fastify";
import fastifySwagger from "@fastify/swagger";
import ScalarApiReference from "@scalar/fastify-api-reference";
import "./auth/middleware";
import { healthRoutes } from "./health/routes";
import { createAuthRoutes } from "./auth/routes";
import { DrizzleAuthRepository } from "./auth/repository";
import { AuthService } from "./auth/service";
import { createTaskRoutes } from "./tasks/routes";
import { DrizzleTaskRepository } from "./tasks/repository";
import { TaskService } from "./tasks/service";

export function createServer(): FastifyInstance {
  const server = fastify({ logger: false });

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
      console.log(`Server listening on http://0.0.0.0:${PORT}`);
      console.log(`API docs: http://0.0.0.0:${PORT}/docs`);
      console.log(`OpenAPI spec: http://0.0.0.0:${PORT}/openapi.json`);
    } catch (err) {
      server.log.error(err);
      process.exit(1);
    }
  };

  start();
}
