import fastify, { FastifyInstance } from "fastify";
import { zodToJsonSchema } from "zod-to-json-schema";
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
    const jsonSchema = zodToJsonSchema(schema as never);
    return (data: unknown) => {
      return { value: data };
    };
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
    } catch (err) {
      server.log.error(err);
      process.exit(1);
    }
  };

  start();
}
