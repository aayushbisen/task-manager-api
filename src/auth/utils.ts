import type { FastifyRequest, FastifyReply, FastifyInstance } from "fastify";
import type { AuthService } from "./service";
import { AppError } from "../errors";

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

export function handleError(error: unknown, reply: FastifyReply) {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({ error: error.message });
  }
  throw error;
}

export function createAuthenticateMiddleware(authService: AuthService) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return reply.status(401).send({ error: "Missing authorization header" });
    }

    const [scheme, token] = authHeader.split(" ");
    if (scheme !== "Bearer" || !token) {
      return reply.status(401).send({ error: "Invalid authorization header format" });
    }

    try {
      const payload = authService.verifyAccessToken(token);
      request.user = payload;
    } catch {
      return reply.status(401).send({ error: "Invalid or expired token" });
    }
  };
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply, authService: AuthService) {
  const authHeader = request.headers.authorization;
  if (!authHeader) {
    return reply.status(401).send({ error: "Missing authorization header" });
  }

  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return reply.status(401).send({ error: "Invalid authorization header format" });
  }

  try {
    const payload = authService.verifyAccessToken(token);
    request.user = payload;
  } catch {
    return reply.status(401).send({ error: "Invalid or expired token" });
  }
}