import { describe, it, expect, beforeEach } from "vitest";
import { server } from "../src/index";
import { clearDB, registerUser, authHeader } from "./helpers";
import type { AuthTokens } from "../src/auth/schema.zod";

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
