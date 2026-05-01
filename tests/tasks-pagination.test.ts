import { describe, it, expect, beforeEach } from "vitest";
import { server } from "../src/index";
import { clearDB, registerUser, authHeader } from "./helpers";

describe("Tasks Pagination", () => {
  let userTokens: { accessToken: string };

  beforeEach(async () => {
    clearDB();
    userTokens = await registerUser("pagetest@example.com", "password123", "Paginator");
  });

  it("lists first page with correct pagination metadata", async () => {
    // Create 4 tasks for the user
    for (let i = 1; i <= 4; i++) {
      const res = await server.inject({
        method: "POST",
        url: "/tasks",
        headers: authHeader(userTokens.accessToken),
        payload: { title: `Paginated task ${i}` },
      });
      expect(res.statusCode).toBe(201);
    }

    const res = await server.inject({
      method: "GET",
      url: "/tasks?page=1&limit=2",
      headers: authHeader(userTokens.accessToken),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data).toHaveLength(2);
    expect(body.pagination.total).toBe(4);
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.limit).toBe(2);
    expect(body.pagination.totalPages).toBe(2);
  });

  it("lists second page with remaining tasks", async () => {
    // Reuse by ensuring tasks exist
    for (let i = 1; i <= 4; i++) {
      const res = await server.inject({
        method: "POST",
        url: "/tasks",
        headers: authHeader(userTokens.accessToken),
        payload: { title: `Paginated task ${i}` },
      });
      expect(res.statusCode).toBe(201);
    }

    const res = await server.inject({
      method: "GET",
      url: "/tasks?page=2&limit=2",
      headers: authHeader(userTokens.accessToken),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data).toHaveLength(2);
    expect(body.pagination.page).toBe(2);
    expect(body.pagination.limit).toBe(2);
    expect(body.pagination.total).toBe(4);
  });
});
