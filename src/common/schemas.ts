export const errorSchema = {
  type: "object" as const,
  properties: {
    error: { type: "string" as const },
  },
  required: ["error"],
};

export const tokensSchema = {
  type: "object" as const,
  properties: {
    accessToken: { type: "string" as const },
    refreshToken: { type: "string" as const },
  },
  required: ["accessToken", "refreshToken"],
};

export const taskSchema = {
  type: "object" as const,
  properties: {
    id: { type: "string" as const },
    ownerId: { type: "string" as const },
    title: { type: "string" as const },
    description: { type: "string" as const, nullable: true },
    done: { type: "boolean" as const },
    priority: { type: "string" as const, enum: ["low", "medium", "high"] },
    dueDate: { type: "string" as const, nullable: true },
    createdAt: { type: "string" as const },
    updatedAt: { type: "string" as const },
  },
  required: ["id", "ownerId", "title", "done", "priority", "createdAt", "updatedAt"],
};

export const userSchema = {
  type: "object" as const,
  properties: {
    id: { type: "string" as const },
    email: { type: "string" as const },
    name: { type: "string" as const, nullable: true },
    role: { type: "string" as const, enum: ["user", "admin"] },
    createdAt: { type: "string" as const },
    updatedAt: { type: "string" as const },
  },
  required: ["id", "email", "role", "createdAt", "updatedAt"],
};

export const paginationSchema = {
  type: "object" as const,
  properties: {
    data: {
      type: "array" as const,
      items: taskSchema,
    },
    pagination: {
      type: "object" as const,
      properties: {
        page: { type: "number" as const },
        limit: { type: "number" as const },
        total: { type: "number" as const },
        totalPages: { type: "number" as const },
      },
      required: ["page", "limit", "total", "totalPages"],
    },
  },
  required: ["data", "pagination"],
};
