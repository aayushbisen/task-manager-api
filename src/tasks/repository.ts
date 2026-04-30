import { eq, desc, or } from "drizzle-orm";
import { db } from "../db/connection";
import { tasks, type Task, type NewTask } from "../db/schema";

export interface ITaskRepository {
  findAllByOwnerId(ownerId: string): Promise<Task[]>;
  findAll(): Promise<Task[]>;
  findById(id: string): Promise<Task | undefined>;
  findByIdAndOwner(id: string, ownerId: string): Promise<Task | undefined>;
  create(input: NewTask): Promise<Task>;
  update(id: string, input: Partial<NewTask>): Promise<Task | undefined>;
  delete(id: string): Promise<Task | undefined>;
  count(): Promise<number>;
}

export class DrizzleTaskRepository implements ITaskRepository {
  async findAllByOwnerId(ownerId: string): Promise<Task[]> {
    return db.select().from(tasks).where(eq(tasks.ownerId, ownerId)).orderBy(desc(tasks.createdAt));
  }

  async findAll(): Promise<Task[]> {
    return db.select().from(tasks).orderBy(desc(tasks.createdAt));
  }

  async findById(id: string): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    return task;
  }

  async findByIdAndOwner(id: string, ownerId: string): Promise<Task | undefined> {
    const [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, id));
    if (task && task.ownerId !== ownerId) return undefined;
    return task;
  }

  async create(input: NewTask): Promise<Task> {
    const [task] = await db.insert(tasks).values(input).returning();
    return task;
  }

  async update(id: string, input: Partial<NewTask>): Promise<Task | undefined> {
    const [task] = await db
      .update(tasks)
      .set({ ...input, updatedAt: new Date().toISOString() })
      .where(eq(tasks.id, id))
      .returning();
    return task;
  }

  async delete(id: string): Promise<Task | undefined> {
    const [task] = await db
      .delete(tasks)
      .where(eq(tasks.id, id))
      .returning();
    return task;
  }

  async count(): Promise<number> {
    const [{ count }] = await db.select({ count: tasks.id }).from(tasks);
    return typeof count === "number" ? count : 0;
  }
}
