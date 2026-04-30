import type { ITaskRepository, TaskFilters, PaginatedResult } from "./repository";
import { TaskNotFoundError } from "../errors";
import type { Task, NewTask } from "../db/schema";

export class TaskService {
  constructor(private repository: ITaskRepository) {}

  async getAllTasks(userId: string, isAdmin: boolean): Promise<Task[]> {
    if (isAdmin) {
      return this.repository.findAll();
    }
    return this.repository.findAllByOwnerId(userId);
  }

  async getPaginatedTasks(
    userId: string,
    isAdmin: boolean,
    filters: TaskFilters,
    orderBy: string,
    orderDir: "asc" | "desc",
    page: number,
    limit: number,
  ): Promise<PaginatedResult<Task>> {
    if (isAdmin) {
      return this.repository.findPaginatedAdmin(filters, orderBy, orderDir, page, limit);
    }
    return this.repository.findPaginated(userId, filters, orderBy, orderDir, page, limit);
  }

  async getTaskById(id: string, userId: string, isAdmin: boolean): Promise<Task> {
    if (isAdmin) {
      const task = await this.repository.findById(id);
      if (!task) throw new TaskNotFoundError(id);
      return task;
    }
    const task = await this.repository.findByIdAndOwner(id, userId);
    if (!task) throw new TaskNotFoundError(id);
    return task;
  }

  async createTask(input: NewTask): Promise<Task> {
    return this.repository.create(input);
  }

  async updateTask(id: string, input: Partial<NewTask>, userId: string, isAdmin: boolean): Promise<Task> {
    if (!isAdmin) {
      const existing = await this.repository.findByIdAndOwner(id, userId);
      if (!existing) throw new TaskNotFoundError(id);
    } else {
      const existing = await this.repository.findById(id);
      if (!existing) throw new TaskNotFoundError(id);
    }
    const updated = await this.repository.update(id, input);
    if (!updated) throw new TaskNotFoundError(id);
    return updated;
  }

  async deleteTask(id: string, userId: string, isAdmin: boolean): Promise<Task> {
    if (!isAdmin) {
      const existing = await this.repository.findByIdAndOwner(id, userId);
      if (!existing) throw new TaskNotFoundError(id);
    } else {
      const existing = await this.repository.findById(id);
      if (!existing) throw new TaskNotFoundError(id);
    }
    const deleted = await this.repository.delete(id);
    if (!deleted) throw new TaskNotFoundError(id);
    return deleted;
  }

  async countTasks(): Promise<number> {
    return this.repository.count();
  }
}
