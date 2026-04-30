import { FastifyPluginAsync, FastifyReply } from "fastify";
import type { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "@fastify/type-provider-zod";
import type { TaskService } from "./service";
import type { AuthService } from "../auth/service";
import { createTaskSchema, updateTaskSchema, taskParamsSchema } from "./schema.zod";
import { AppError } from "../errors";
import { errorSchema, taskSchema } from "../common/schemas";
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

const tasksListSchema = {
  type: "array" as const,
  items: taskSchema,
};

const taskWithMessageSchema = {
  type: "object" as const,
  properties: {
    message: { type: "string" as const },
    task: taskSchema,
  },
  required: ["message", "task"],
};

const openApiSchemas = {
  listTasks: {
    tags: ["Tasks"],
    summary: "List all tasks",
    description: "Returns tasks owned by the authenticated user. Admins see all tasks.",
    security: [{ bearerAuth: [] }],
    response: {
      200: tasksListSchema,
      401: errorSchema,
    },
  },
  createTask: {
    tags: ["Tasks"],
    summary: "Create a task",
    description: "Creates a new task owned by the authenticated user",
    security: [{ bearerAuth: [] }],
    body: createTaskSchema,
    response: {
      201: taskSchema,
      400: errorSchema,
      401: errorSchema,
    },
  },
  getTask: {
    tags: ["Tasks"],
    summary: "Get task by ID",
    description: "Returns a specific task. Users can only access their own tasks.",
    security: [{ bearerAuth: [] }],
    response: {
      200: taskSchema,
      401: errorSchema,
      404: errorSchema,
    },
  },
  updateTask: {
    tags: ["Tasks"],
    summary: "Update a task",
    description: "Updates a task. Users can only update their own tasks.",
    security: [{ bearerAuth: [] }],
    body: updateTaskSchema,
    response: {
      200: taskSchema,
      400: errorSchema,
      401: errorSchema,
      404: errorSchema,
    },
  },
  deleteTask: {
    tags: ["Tasks"],
    summary: "Delete a task",
    description: "Deletes a task. Users can only delete their own tasks.",
    security: [{ bearerAuth: [] }],
    response: {
      200: taskWithMessageSchema,
      401: errorSchema,
      404: errorSchema,
    },
  },
};

export function createTaskRoutes(taskService: TaskService, authService: AuthService): FastifyPluginAsync {
  return async (fastify: FastifyInstance) => {
    const app = fastify.withTypeProvider<ZodTypeProvider>();

    app.addHook("preHandler", async (request, reply) => {
      await authenticate(request, reply, authService);
    });

    app.get("/tasks", { schema: openApiSchemas.listTasks }, async (request) => {
      const { sub: userId, role } = request.user;
      return taskService.getAllTasks(userId, role === "admin");
    });

    app.post<{ Body: CreateTaskBody }>(
      "/tasks",
      { schema: openApiSchemas.createTask },
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
      { schema: openApiSchemas.getTask },
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
      { schema: openApiSchemas.updateTask },
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
      { schema: openApiSchemas.deleteTask },
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
