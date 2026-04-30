import type { FastifyRequest, FastifyReply } from "fastify";
import type { AuthService } from "./service";

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
