import { z } from "zod";

export const createTaskSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  dueDate: z.string().datetime().optional().or(z.string().date().optional()),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  dueDate: z.string().datetime().optional().or(z.string().date().optional()),
  done: z.boolean().optional(),
});

export const taskParamsSchema = z.object({
  id: z.string().uuid(),
});

export const listTasksQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  done: z.enum(["true", "false"]).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  search: z.string().max(255).optional(),
  orderBy: z.enum(["createdAt", "title", "priority", "dueDate"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;

export function parseListTasksQuery(raw: z.infer<typeof listTasksQuerySchema>) {
  const { done, ...rest } = raw;
  return {
    ...rest,
    done: done === "true" ? true : done === "false" ? false : undefined,
  };
}

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type TaskParams = z.infer<typeof taskParamsSchema>;
