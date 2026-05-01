import { describe, it, expect, beforeEach } from "vitest";
import { server } from "../src/index";
import { clearDB, registerUser, authHeader, makeAdmin, login } from "./helpers";

describe("Admin Visibility", () => {
  let adminTokens: { accessToken: string };
  beforeEach(async () => {
    clearDB();
    // Create an admin user
    await registerUser("adminvisibility@example.com", "password123", "AdminVis");
    await makeAdmin("adminvisibility@example.com");
    adminTokens = await login("adminvisibility@example.com", "password123");
  });

  it("admin sees all tasks across users", async () => {
    // Create two normal users and their tasks
    const u1 = await registerUser("usera-vis@example.com", "password123", "User A");
    const u2 = await registerUser("userb-vis@example.com", "password123", "User B");
    // User A creates a task
    await server.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeader(u1.accessToken),
      payload: { title: "User A task" },
    });
    // User B creates a task
    await server.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeader(u2.accessToken),
      payload: { title: "User B task" },
    });

    // Admin lists all tasks
    const res = await server.inject({
      method: "GET",
      url: "/tasks",
      headers: authHeader(adminTokens.accessToken),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.data)).toBe(true);
    // Should see at least the two tasks created above
    const titles = body.data.map((t: any) => t.title);
    expect(titles).toContain("User A task");
    expect(titles).toContain("User B task");
  });
});
