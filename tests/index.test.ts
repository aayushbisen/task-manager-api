import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { server } from "../src/index";
import { sqlite } from "../src/db/connection";
import type { AuthTokens } from "../src/auth/schema.zod";
import { db } from "../src/db/connection";
import { eq } from "drizzle-orm";
import { users } from "../src/db/schema";

beforeAll(async () => {
  await server.ready();
});

afterAll(async () => {
  await server.close();
});

function clearDB() {
  sqlite.exec("DELETE FROM refresh_tokens");
  sqlite.exec("DELETE FROM tasks");
  sqlite.exec("DELETE FROM users");
}

async function registerUser(email: string, password: string, name?: string): Promise<AuthTokens> {
  const res = await server.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password, name },
  });
  expect(res.statusCode).toBe(201);
  return JSON.parse(res.payload);
}

async function login(email: string, password: string): Promise<AuthTokens> {
  const res = await server.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password },
  });
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.payload);
}

async function makeAdmin(email: string): Promise<void> {
  await db.update(users).set({ role: "admin" }).where(eq(users.email, email));
}

function authHeader(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

describe("Auth: Register", () => {
  beforeEach(clearDB);

  it("should register a new user and return tokens", async () => {
    const tokens = await registerUser("test@example.com", "password123", "Test User");
    expect(tokens.accessToken).toBeDefined();
    expect(tokens.refreshToken).toBeDefined();
  });

  it("should return 400 for invalid email", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "invalid", password: "password123" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("should return 400 for short password", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "test@example.com", password: "short" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("should return 409 for duplicate email", async () => {
    await registerUser("dup@example.com", "password123");
    const res = await server.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "dup@example.com", password: "password456" },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe("Auth: Login", () => {
  beforeEach(clearDB);

  it("should login with correct credentials", async () => {
    await registerUser("login@example.com", "password123");
    const tokens = await login("login@example.com", "password123");
    expect(tokens.accessToken).toBeDefined();
    expect(tokens.refreshToken).toBeDefined();
  });

  it("should return 400 for wrong password", async () => {
    await registerUser("wrong@example.com", "password123");
    const res = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "wrong@example.com", password: "wrongpass" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("should return 400 for non-existent email", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "nope@example.com", password: "password123" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("Auth: Refresh", () => {
  beforeEach(clearDB);

  it("should refresh tokens with valid refresh token", async () => {
    const { refreshToken } = await registerUser("refresh@example.com", "password123");
    const res = await server.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken },
    });
    expect(res.statusCode).toBe(200);
    const tokens = JSON.parse(res.payload);
    expect(tokens.accessToken).toBeDefined();
    expect(tokens.refreshToken).toBeDefined();
  });

  it("should return 400 for invalid refresh token", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: "invalid-token" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("Auth: Logout", () => {
  beforeEach(clearDB);

  it("should logout and invalidate refresh token", async () => {
    const { refreshToken } = await registerUser("logout@example.com", "password123");
    const res = await server.inject({
      method: "POST",
      url: "/auth/logout",
      payload: { refreshToken },
    });
    expect(res.statusCode).toBe(204);

    const refreshRes = await server.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken },
    });
    expect(refreshRes.statusCode).toBe(400);
  });
});

describe("Auth: Profile", () => {
  let tokens: AuthTokens;

  beforeEach(async () => {
    clearDB();
    tokens = await registerUser("profile@example.com", "password123", "Profile User");
  });

  it("should get current user profile", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/auth/me",
      headers: authHeader(tokens.accessToken),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.email).toBe("profile@example.com");
    expect(body.name).toBe("Profile User");
    expect(body.passwordHash).toBeUndefined();
  });

  it("should return 401 without auth header", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/auth/me",
    });
    expect(res.statusCode).toBe(401);
  });

  it("should update profile", async () => {
    const res = await server.inject({
      method: "PATCH",
      url: "/auth/me",
      headers: authHeader(tokens.accessToken),
      payload: { name: "New Name" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).name).toBe("New Name");
  });

  it("should change password with current password", async () => {
    const res = await server.inject({
      method: "PATCH",
      url: "/auth/me",
      headers: authHeader(tokens.accessToken),
      payload: { currentPassword: "password123", newPassword: "newpassword123" },
    });
    expect(res.statusCode).toBe(200);

    const loginRes = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "profile@example.com", password: "newpassword123" },
    });
    expect(loginRes.statusCode).toBe(200);
  });
});

describe("Protected Routes: Tasks", () => {
  let userTokens: AuthTokens;

  beforeEach(async () => {
    clearDB();
    userTokens = await registerUser("taskuser@example.com", "password123", "Task User");
  });

  it("should return 401 without auth header on tasks routes", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/tasks",
    });
    expect(res.statusCode).toBe(401);
  });

  it("should create a task with owner set", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeader(userTokens.accessToken),
      payload: { title: "My task" },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.title).toBe("My task");
    expect(body.ownerId).toBeDefined();
  });

  it("should only return own tasks", async () => {
    await server.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeader(userTokens.accessToken),
      payload: { title: "User task" },
    });

    const otherTokens = await registerUser("other@example.com", "password123");
    await server.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeader(otherTokens.accessToken),
      payload: { title: "Other task" },
    });

    const res = await server.inject({
      method: "GET",
      url: "/tasks",
      headers: authHeader(userTokens.accessToken),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].title).toBe("User task");
  });

  it("should return 404 for other user's task", async () => {
    const createRes = await server.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeader(userTokens.accessToken),
      payload: { title: "Secret task" },
    });
    const { id } = JSON.parse(createRes.payload);

    const otherTokens = await registerUser("other@example.com", "password123");
    const res = await server.inject({
      method: "GET",
      url: `/tasks/${id}`,
      headers: authHeader(otherTokens.accessToken),
    });
    expect(res.statusCode).toBe(404);
  });

  it("should allow owner to update their task", async () => {
    const createRes = await server.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeader(userTokens.accessToken),
      payload: { title: "Update me" },
    });
    const { id } = JSON.parse(createRes.payload);

    const res = await server.inject({
      method: "PATCH",
      url: `/tasks/${id}`,
      headers: authHeader(userTokens.accessToken),
      payload: { title: "Updated" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).title).toBe("Updated");
  });

  it("should allow owner to delete their task", async () => {
    const createRes = await server.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeader(userTokens.accessToken),
      payload: { title: "Delete me" },
    });
    const { id } = JSON.parse(createRes.payload);

    const res = await server.inject({
      method: "DELETE",
      url: `/tasks/${id}`,
      headers: authHeader(userTokens.accessToken),
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("Admin Routes", () => {
  let adminTokens: AuthTokens;
  let userTokens: AuthTokens;

  beforeEach(async () => {
    clearDB();
    await registerUser("admin@example.com", "password123", "Admin");
    await makeAdmin("admin@example.com");
    adminTokens = await login("admin@example.com", "password123");
    userTokens = await registerUser("regular@example.com", "password123", "Regular");
  });

  it("should return 403 for non-admin accessing /users", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/users",
      headers: authHeader(userTokens.accessToken),
    });
    expect(res.statusCode).toBe(403);
  });

  it("should list all users for admin", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/users",
      headers: authHeader(adminTokens.accessToken),
    });
    expect(res.statusCode).toBe(200);
    const users = JSON.parse(res.payload);
    expect(users.length).toBeGreaterThanOrEqual(2);
  });

  it("should allow admin to delete a user", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/users",
      headers: authHeader(adminTokens.accessToken),
    });
    const users = JSON.parse(res.payload);
    const regularUser = users.find((u: { email: string }) => u.email === "regular@example.com");

    const deleteRes = await server.inject({
      method: "DELETE",
      url: `/users/${regularUser.id}`,
      headers: authHeader(adminTokens.accessToken),
    });
    expect(deleteRes.statusCode).toBe(204);
  });

  it("should allow admin to see all tasks including other users'", async () => {
    await server.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeader(userTokens.accessToken),
      payload: { title: "User task" },
    });

    const res = await server.inject({
      method: "GET",
      url: "/tasks",
      headers: authHeader(adminTokens.accessToken),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Tasks: Pagination", () => {
  let tokens: AuthTokens;

  beforeEach(async () => {
    clearDB();
    tokens = await registerUser("page@example.com", "password123", "Page User");
  });

  async function createTask(title: string, done: boolean = false, priority: "low" | "medium" | "high" = "medium") {
    return server.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeader(tokens.accessToken),
      payload: { title, done, priority },
    });
  }

  it("should return paginated response with default params", async () => {
    await createTask("Task 1");
    const res = await server.inject({
      method: "GET",
      url: "/tasks",
      headers: authHeader(tokens.accessToken),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data).toBeDefined();
    expect(body.pagination).toBeDefined();
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.limit).toBe(20);
    expect(body.pagination.total).toBe(1);
    expect(body.pagination.totalPages).toBe(1);
  });

  it("should respect page and limit params", async () => {
    for (let i = 1; i <= 5; i++) {
      await createTask(`Task ${i}`);
    }

    const res = await server.inject({
      method: "GET",
      url: "/tasks?page=1&limit=2",
      headers: authHeader(tokens.accessToken),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data).toHaveLength(2);
    expect(body.pagination.total).toBe(5);
    expect(body.pagination.totalPages).toBe(3);
  });

  it("should return correct page 2 data", async () => {
    for (let i = 1; i <= 5; i++) {
      await createTask(`Task ${i}`);
    }

    const res = await server.inject({
      method: "GET",
      url: "/tasks?page=2&limit=2",
      headers: authHeader(tokens.accessToken),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data).toHaveLength(2);
    expect(body.pagination.page).toBe(2);
  });

  it("should cap limit at 100", async () => {
    for (let i = 1; i <= 5; i++) {
      await createTask(`Task ${i}`);
    }

    const res = await server.inject({
      method: "GET",
      url: "/tasks?limit=200",
      headers: authHeader(tokens.accessToken),
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("Tasks: Filtering", () => {
  let tokens: AuthTokens;

  beforeEach(async () => {
    clearDB();
    tokens = await registerUser("filter@example.com", "password123", "Filter User");
  });

  async function createTask(title: string, done: boolean = false, priority: "low" | "medium" | "high" = "medium") {
    const res = await server.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeader(tokens.accessToken),
      payload: { title, priority },
    });
    const body = JSON.parse(res.payload);
    if (done) {
      await server.inject({
        method: "PATCH",
        url: `/tasks/${body.id}`,
        headers: authHeader(tokens.accessToken),
        payload: { done: true },
      });
    }
    return res;
  }

  it("should filter by done status", async () => {
    await createTask("Todo");
    await createTask("Done task", true);
    await createTask("Another todo");

    const res = await server.inject({
      method: "GET",
      url: "/tasks?done=true",
      headers: authHeader(tokens.accessToken),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].title).toBe("Done task");
  });

  it("should filter by priority", async () => {
    await createTask("Low", false, "low");
    await createTask("High", false, "high");
    await createTask("Medium", false, "medium");

    const res = await server.inject({
      method: "GET",
      url: "/tasks?priority=high",
      headers: authHeader(tokens.accessToken),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].priority).toBe("high");
  });

  it("should filter by search term in title", async () => {
    await createTask("Buy groceries");
    await createTask("Buy clothes");
    await createTask("Walk dog");

    const res = await server.inject({
      method: "GET",
      url: "/tasks?search=Buy",
      headers: authHeader(tokens.accessToken),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data).toHaveLength(2);
  });

  it("should filter by search term in description", async () => {
    await server.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeader(tokens.accessToken),
      payload: { title: "Task A", description: "This is about groceries" },
    });
    await createTask("Task B");

    const res = await server.inject({
      method: "GET",
      url: "/tasks?search=groceries",
      headers: authHeader(tokens.accessToken),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].title).toBe("Task A");
  });

  it("should combine filters", async () => {
    await createTask("Urgent done", true, "high");
    await createTask("Urgent todo", false, "high");
    await createTask("Low priority", false, "low");

    const res = await server.inject({
      method: "GET",
      url: "/tasks?priority=high&done=true",
      headers: authHeader(tokens.accessToken),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].title).toBe("Urgent done");
  });
});

describe("Tasks: Sorting", () => {
  let tokens: AuthTokens;

  beforeEach(async () => {
    clearDB();
    tokens = await registerUser("sort@example.com", "password123", "Sort User");
  });

  async function createTask(title: string) {
    return server.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeader(tokens.accessToken),
      payload: { title },
    });
  }

  async function createTaskWithPriority(title: string, priority: "low" | "medium" | "high") {
    return server.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeader(tokens.accessToken),
      payload: { title, priority },
    });
  }

  it("should sort by title ascending", async () => {
    await createTask("Zebra");
    await createTask("Apple");
    await createTask("Mango");

    const res = await server.inject({
      method: "GET",
      url: "/tasks?orderBy=title&order=asc",
      headers: authHeader(tokens.accessToken),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data[0].title).toBe("Apple");
    expect(body.data[1].title).toBe("Mango");
    expect(body.data[2].title).toBe("Zebra");
  });

  it("should sort by title descending", async () => {
    await createTask("Zebra");
    await createTask("Apple");
    await createTask("Mango");

    const res = await server.inject({
      method: "GET",
      url: "/tasks?orderBy=title&order=desc",
      headers: authHeader(tokens.accessToken),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data[0].title).toBe("Zebra");
    expect(body.data[2].title).toBe("Apple");
  });

  it("should sort by priority", async () => {
    await createTaskWithPriority("Low", "low");
    await createTaskWithPriority("High", "high");
    await createTaskWithPriority("Medium", "medium");

    const res = await server.inject({
      method: "GET",
      url: "/tasks?orderBy=priority&order=asc",
      headers: authHeader(tokens.accessToken),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data[0].priority).toBe("high");
  });

  it("should default sort by createdAt desc", async () => {
    await server.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeader(tokens.accessToken),
      payload: { title: "First" },
    });
    await server.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeader(tokens.accessToken),
      payload: { title: "Second" },
    });
    await server.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeader(tokens.accessToken),
      payload: { title: "Third" },
    });

    const res = await server.inject({
      method: "GET",
      url: "/tasks",
      headers: authHeader(tokens.accessToken),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data[0].title).toBe("Third");
    expect(body.data[2].title).toBe("First");
  });
});

describe("Admin: Paginated Tasks", () => {
  let adminTokens: AuthTokens;
  let userTokens: AuthTokens;

  beforeEach(async () => {
    clearDB();
    await registerUser("admin@example.com", "password123", "Admin");
    await makeAdmin("admin@example.com");
    adminTokens = await login("admin@example.com", "password123");
    userTokens = await registerUser("user@example.com", "password123", "User");
  });

  it("should see all tasks with pagination", async () => {
    await server.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeader(userTokens.accessToken),
      payload: { title: "User task" },
    });

    const res = await server.inject({
      method: "GET",
      url: "/tasks?limit=10",
      headers: authHeader(adminTokens.accessToken),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  it("should apply filters across all users", async () => {
    const userTask = await server.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeader(userTokens.accessToken),
      payload: { title: "Done task" },
    });
    const taskId = JSON.parse(userTask.payload).id;
    await server.inject({
      method: "PATCH",
      url: `/tasks/${taskId}`,
      headers: authHeader(userTokens.accessToken),
      payload: { done: true },
    });

    const res = await server.inject({
      method: "GET",
      url: "/tasks?done=true",
      headers: authHeader(adminTokens.accessToken),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });
});
