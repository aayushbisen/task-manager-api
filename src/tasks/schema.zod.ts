import { z } from "zod";

export const createTaskSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  dueDate: z.string().datetime().optional().or(z.string().date().optional()),
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  done: z.boolean().optional(),
});

export const taskParamsSchema = z.object({
  id: z.string().uuid(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type TaskParams = z.infer<typeof taskParamsSchema>;
