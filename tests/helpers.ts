import { beforeAll, afterAll, expect } from "vitest";
import { server } from "../src/index";
import { sqlite } from "../src/db/connection";
import { db } from "../src/db/connection";
import { eq } from "drizzle-orm";
import { users } from "../src/db/schema";
import type { AuthTokens } from "../src/auth/schema.zod";

beforeAll(async () => {
  await server.ready();
});

afterAll(async () => {
  await server.close();
});

export function clearDB() {
  sqlite.exec("DELETE FROM refresh_tokens");
  sqlite.exec("DELETE FROM tasks");
  sqlite.exec("DELETE FROM users");
}

export async function registerUser(email: string, password: string, name?: string): Promise<AuthTokens> {
  const res = await server.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password, name },
  });
  expect(res.statusCode).toBe(201);
  return JSON.parse(res.payload);
}

export async function login(email: string, password: string): Promise<AuthTokens> {
  const res = await server.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password },
  });
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.payload);
}

export async function makeAdmin(email: string): Promise<void> {
  await db.update(users).set({ role: "admin" }).where(eq(users.email, email));
}

export function authHeader(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}
