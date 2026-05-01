import { describe, it, expect, beforeEach } from "vitest";
import { server } from "../src/index";
import { clearDB, registerUser, login, authHeader, makeAdmin } from "./helpers";
import type { AuthTokens } from "../src/auth/schema.zod";

describe("Tasks: CRUD & Ownership", () => {
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

  it("should allow owner to update task priority", async () => {
    const createRes = await server.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeader(userTokens.accessToken),
      payload: { title: "Priority task", priority: "low" },
    });
    const { id } = JSON.parse(createRes.payload);

    const res = await server.inject({
      method: "PATCH",
      url: `/tasks/${id}`,
      headers: authHeader(userTokens.accessToken),
      payload: { priority: "high" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).priority).toBe("high");
  });

  it("should allow owner to update done status", async () => {
    const createRes = await server.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeader(userTokens.accessToken),
      payload: { title: "Mark done" },
    });
    const { id } = JSON.parse(createRes.payload);

    const res = await server.inject({
      method: "PATCH",
      url: `/tasks/${id}`,
      headers: authHeader(userTokens.accessToken),
      payload: { done: true },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).done).toBe(true);
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

  it("should not allow non-owner to update a task", async () => {
    const createRes = await server.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeader(userTokens.accessToken),
      payload: { title: "Owner's task" },
    });
    const { id } = JSON.parse(createRes.payload);

    const otherTokens = await registerUser("intruder@example.com", "password123");
    const res = await server.inject({
      method: "PATCH",
      url: `/tasks/${id}`,
      headers: authHeader(otherTokens.accessToken),
      payload: { title: "Hacked" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("should not allow non-owner to delete a task", async () => {
    const createRes = await server.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeader(userTokens.accessToken),
      payload: { title: "Owner's task to delete" },
    });
    const { id } = JSON.parse(createRes.payload);

    const otherTokens = await registerUser("intruder2@example.com", "password123");
    const res = await server.inject({
      method: "DELETE",
      url: `/tasks/${id}`,
      headers: authHeader(otherTokens.accessToken),
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("Admin: Task Visibility", () => {
  let adminTokens: AuthTokens;
  let userTokens: AuthTokens;

  beforeEach(async () => {
    clearDB();
    await registerUser("admintask@example.com", "password123", "Admin");
    await makeAdmin("admintask@example.com");
    adminTokens = await login("admintask@example.com", "password123");
    userTokens = await registerUser("usertask@example.com", "password123", "User");
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
