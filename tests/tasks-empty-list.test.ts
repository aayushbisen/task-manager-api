import { describe, it, expect, beforeEach } from "vitest";
import { server } from "../src/index";
import { clearDB, registerUser, authHeader } from "./helpers";
import type { AuthTokens } from "../src/auth/schema.zod";

describe("Tasks Empty List & Validation", () => {
  let userTokens: AuthTokens;

  beforeEach(async () => {
    clearDB();
    userTokens = await registerUser("emptylist@example.com", "password123", "Empty List User");
  });

  it("returns empty data and correct pagination when no tasks exist", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/tasks?page=1&limit=5",
      headers: authHeader(userTokens.accessToken),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(0);
    expect(body.pagination).toBeDefined();
    expect(body.pagination.total).toBe(0);
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.limit).toBe(5);
    // When there are zero tasks, totalPages should be 0
    expect(body.pagination.totalPages).toBe(0);
  });
});
