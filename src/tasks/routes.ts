import { FastifyPluginAsync, FastifyReply } from "fastify";
import type { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "@fastify/type-provider-zod";
import type { TaskService } from "./service";
import type { AuthService } from "../auth/service";
import { createTaskSchema, updateTaskSchema, taskParamsSchema } from "./schema.zod";
import { AppError } from "../errors";
import type { Task } from "../db/schema";
import type { z } from "zod";

type CreateTaskBody = z.infer<typeof createTaskSchema>;
type UpdateTaskBody = z.infer<typeof updateTaskSchema>;

function handleError(error: unknown, reply: FastifyReply) {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({ error: error.message });
  }
  throw error;
}

async function authenticate(request: any, reply: FastifyReply, authService: AuthService) {
  const authHeader = request.headers.authorization;
  if (!authHeader) {
    return reply.status(401).send({ error: "Missing authorization header" });
  }

  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return reply.status(401).send({ error: "Invalid authorization header format" });
  }

  try {
    const payload = authService.verifyAccessToken(token);
    request.user = payload;
  } catch {
    return reply.status(401).send({ error: "Invalid or expired token" });
  }
}

export function createTaskRoutes(taskService: TaskService, authService: AuthService): FastifyPluginAsync {
  return async (fastify: FastifyInstance) => {
    const app = fastify.withTypeProvider<ZodTypeProvider>();

    app.addHook("preHandler", async (request, reply) => {
      await authenticate(request, reply, authService);
    });

    app.get("/tasks", async (request) => {
      const { sub: userId, role } = request.user;
      return taskService.getAllTasks(userId, role === "admin");
    });

    app.post<{ Body: CreateTaskBody }>(
      "/tasks",
      {
        schema: {
          body: createTaskSchema,
        },
      },
      async (request, reply) => {
        const { sub: userId } = request.user;
        const task = await taskService.createTask({
          id: crypto.randomUUID(),
          ownerId: userId,
          ...request.body,
        });
        return reply.status(201).send(task);
      }
    );

    app.get<{ Params: z.infer<typeof taskParamsSchema> }>(
      "/tasks/:id",
      {
        schema: {
          params: taskParamsSchema,
        },
      },
      async (request, reply) => {
        try {
          const { sub: userId, role } = request.user;
          return await taskService.getTaskById(request.params.id, userId, role === "admin");
        } catch (error) {
          return handleError(error, reply);
        }
      }
    );

    app.patch<{ Params: z.infer<typeof taskParamsSchema>; Body: UpdateTaskBody }>(
      "/tasks/:id",
      {
        schema: {
          params: taskParamsSchema,
          body: updateTaskSchema,
        },
      },
      async (request, reply) => {
        try {
          const { sub: userId, role } = request.user;
          return await taskService.updateTask(request.params.id, request.body, userId, role === "admin");
        } catch (error) {
          return handleError(error, reply);
        }
      }
    );

    app.delete<{ Params: z.infer<typeof taskParamsSchema> }>(
      "/tasks/:id",
      {
        schema: {
          params: taskParamsSchema,
        },
      },
      async (request, reply) => {
        try {
          const { sub: userId, role } = request.user;
          const task = await taskService.deleteTask(request.params.id, userId, role === "admin");
          return { message: "Task deleted", task };
        } catch (error) {
          return handleError(error, reply);
        }
      }
    );
  };
}
