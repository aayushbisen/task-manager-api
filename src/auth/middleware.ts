import type { FastifyRequest, FastifyReply, FastifyInstance, FastifyPluginAsync } from "fastify";
import type { AuthService } from "../auth/service";
import type { JwtPayload } from "../auth/schema.zod";

export interface AuthenticatedUser extends JwtPayload {}

declare module "fastify" {
  interface FastifyRequest {
    user: AuthenticatedUser;
  }
}

export function createAuthenticateMiddleware(authService: AuthService): FastifyPluginAsync {
  return async (fastify: FastifyInstance) => {
    fastify.addHook("preHandler", async (request, reply) => {
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
    });
  };
}

export function requireRole(...roles: ("user" | "admin")[]): (request: FastifyRequest, reply: FastifyReply) => void {
  return (request: FastifyRequest, reply: FastifyReply) => {
    if (!roles.includes(request.user.role)) {
      return reply.status(403).send({ error: "Insufficient permissions" });
    }
  };
}
