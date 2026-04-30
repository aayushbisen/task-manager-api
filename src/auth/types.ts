import type { FastifyRequest } from "fastify";

export interface AuthenticatedUser {
  sub: string;
  email: string;
  name: string | null;
  role: "user" | "admin";
}

declare module "fastify" {
  interface FastifyRequest {
    user: AuthenticatedUser;
  }
}
