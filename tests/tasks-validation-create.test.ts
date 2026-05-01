import { describe, it, expect, beforeEach } from "vitest";
import { server } from "../src/index";
import { clearDB, registerUser, authHeader } from "./helpers";
import type { AuthTokens } from "../src/auth/schema.zod";

describe("Task Creation Validation", () => {
  let userTokens: AuthTokens;

  beforeEach(async () => {
    clearDB();
    userTokens = await registerUser("validation-create@example.com", "password123", "Validator");
  });

  it("returns 400 when creating a task with missing required fields", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeader(userTokens.accessToken),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});
