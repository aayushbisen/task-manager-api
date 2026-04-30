import { eq, desc, asc, or, like, and, SQL, count } from "drizzle-orm";
import { db } from "../db/connection";
import { tasks, type Task, type NewTask } from "../db/schema";

export interface TaskFilters {
  done?: boolean;
  priority?: "low" | "medium" | "high";
  search?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ITaskRepository {
  findAllByOwnerId(ownerId: string): Promise<Task[]>;
  findAll(): Promise<Task[]>;
  findById(id: string): Promise<Task | undefined>;
  findByIdAndOwner(id: string, ownerId: string): Promise<Task | undefined>;
  create(input: NewTask): Promise<Task>;
  update(id: string, input: Partial<NewTask>): Promise<Task | undefined>;
  delete(id: string): Promise<Task | undefined>;
  count(): Promise<number>;
  findPaginated(
    ownerId: string,
    filters: TaskFilters,
    orderBy: string,
    orderDir: "asc" | "desc",
    page: number,
    limit: number,
  ): Promise<PaginatedResult<Task>>;
  findPaginatedAdmin(
    filters: TaskFilters,
    orderBy: string,
    orderDir: "asc" | "desc",
    page: number,
    limit: number,
  ): Promise<PaginatedResult<Task>>;
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
    const [{ count: total }] = await db.select({ count: count() }).from(tasks);
    return typeof total === "number" ? total : 0;
  }

  private buildWhereClause(filters: TaskFilters, ownerId?: string): SQL | undefined {
    const conditions: SQL[] = [];

    if (ownerId) {
      conditions.push(eq(tasks.ownerId, ownerId));
    }
    if (filters.done !== undefined) {
      conditions.push(eq(tasks.done, filters.done));
    }
    if (filters.priority) {
      conditions.push(eq(tasks.priority, filters.priority));
    }
    if (filters.search) {
      const searchPattern = `%${filters.search}%`;
      conditions.push(or(like(tasks.title, searchPattern), like(tasks.description, searchPattern))!);
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  private buildOrderBy(orderBy: string, orderDir: "asc" | "desc") {
    const colMap: Record<string, any> = {
      createdAt: tasks.createdAt,
      title: tasks.title,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
    };
    const col = colMap[orderBy] ?? tasks.createdAt;
    return orderDir === "asc" ? asc(col) : desc(col);
  }

  async findPaginated(
    ownerId: string | undefined,
    filters: TaskFilters,
    orderBy: string,
    orderDir: "asc" | "desc",
    page: number,
    limit: number,
  ): Promise<PaginatedResult<Task>> {
    const whereClause = this.buildWhereClause(filters, ownerId);

    const [{ count: total }] = await db.select({ count: count() }).from(tasks).where(whereClause);

    const data = await db
      .select()
      .from(tasks)
      .where(whereClause)
      .orderBy(this.buildOrderBy(orderBy, orderDir))
      .limit(limit)
      .offset((page - 1) * limit);

    const totalCount = typeof total === "number" ? total : 0;

    return {
      data,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    };
  }

  async findPaginatedAdmin(
    filters: TaskFilters,
    orderBy: string,
    orderDir: "asc" | "desc",
    page: number,
    limit: number,
  ): Promise<PaginatedResult<Task>> {
    return this.findPaginated(undefined, filters, orderBy, orderDir, page, limit);
  }
}
