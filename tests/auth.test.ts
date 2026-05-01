import { describe, it, expect, beforeEach } from "vitest";
import { server } from "../src/index";
import { clearDB, registerUser, login, authHeader, makeAdmin } from "./helpers";
import type { AuthTokens } from "../src/auth/schema.zod";

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

describe("Auth: Admin User Management", () => {
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
    const usersList = JSON.parse(res.payload);
    expect(usersList.length).toBeGreaterThanOrEqual(2);
  });

  it("should allow admin to delete a user", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/users",
      headers: authHeader(adminTokens.accessToken),
    });
    const usersList = JSON.parse(res.payload);
    const regularUser = usersList.find((u: { email: string }) => u.email === "regular@example.com");

    const deleteRes = await server.inject({
      method: "DELETE",
      url: `/users/${regularUser.id}`,
      headers: authHeader(adminTokens.accessToken),
    });
    expect(deleteRes.statusCode).toBe(204);
  });
});
