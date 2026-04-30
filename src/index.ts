import fastify, { FastifyInstance } from "fastify";
import { requestIdPlugin } from "./plugins/request-id";
import { errorHandlerPlugin } from "./plugins/error-handler";
import { corsPlugin } from "./plugins/cors";
import { rateLimitPlugin } from "./plugins/rate-limit";
import { swaggerPlugin } from "./plugins/swagger";
import { healthRoutes } from "./health/routes";
import { createAuthRoutes } from "./auth/routes";
import { DrizzleAuthRepository } from "./auth/repository";
import { AuthService } from "./auth/service";
import { createAuthenticateMiddleware } from "./auth/middleware";
import { createTaskRoutes } from "./tasks/routes";
import { DrizzleTaskRepository } from "./tasks/repository";
import { TaskService } from "./tasks/service";
import { registerGracefulShutdown } from "./graceful-shutdown";
import "./auth/types";

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

  // Register infrastructure plugins
  server.register(requestIdPlugin);
  server.register(errorHandlerPlugin);
  server.register(corsPlugin);
  if (!process.env.VITEST) {
    server.register(rateLimitPlugin);
  }

  // Set up zod schema validator compiler (must be on root server, not in a plugin)
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

  server.register(swaggerPlugin);

  // Dependency injection: repository → service → routes
  const authRepository = new DrizzleAuthRepository();
  const authService = new AuthService(authRepository);
  const authenticate = createAuthenticateMiddleware(authService);

  const taskRepository = new DrizzleTaskRepository();
  const taskService = new TaskService(taskRepository);

  // Register route plugins
  server.register(healthRoutes);
  server.register(createAuthRoutes(authService));
  server.register(createTaskRoutes(taskService, authenticate));

  return server;
}

export const server = createServer();

const PORT = Number(process.env.PORT) || 3000;

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
  registerGracefulShutdown(server);
}
