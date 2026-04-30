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
    const tasks = JSON.parse(res.payload);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("User task");
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
    const tasks = JSON.parse(res.payload);
    expect(tasks.length).toBeGreaterThanOrEqual(1);
  });
});
