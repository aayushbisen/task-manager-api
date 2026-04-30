export class AppError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class TaskNotFoundError extends AppError {
  constructor(id: string) {
    super(`Task with id '${id}' not found`, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}

export class DuplicateResourceError extends AppError {
  constructor(resource: string, field: string) {
    super(`${resource} with ${field} already exists`, 409);
  }
}
