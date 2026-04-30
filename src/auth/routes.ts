import { FastifyPluginAsync, FastifyReply } from "fastify";
import type { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "@fastify/type-provider-zod";
import type { AuthService } from "./service";
import { registerSchema, loginSchema, updateProfileSchema } from "./schema.zod";
import { AppError } from "../errors";
import { z } from "zod";

const refreshTokenSchema = z.object({
  refreshToken: z.string(),
});

function handleError(error: unknown, reply: FastifyReply) {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({ error: error.message });
  }
  throw error;
}

async function authenticate(request: any, reply: FastifyReply, authService: AuthService) {
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

function requireRole(...roles: ("user" | "admin")[]) {
  return async (request: any, reply: FastifyReply) => {
    if (!roles.includes(request.user.role)) {
      return reply.status(403).send({ error: "Insufficient permissions" });
    }
  };
}

export function createAuthRoutes(authService: AuthService): FastifyPluginAsync {
  return async (fastify: FastifyInstance) => {
    const app = fastify.withTypeProvider<ZodTypeProvider>();

    app.post(
      "/auth/register",
      { schema: { body: registerSchema } },
      async (request, reply) => {
        try {
          const tokens = await authService.register(request.body);
          return reply.status(201).send(tokens);
        } catch (error) {
          return handleError(error, reply);
        }
      }
    );

    app.post(
      "/auth/login",
      { schema: { body: loginSchema } },
      async (request, reply) => {
        try {
          const tokens = await authService.login(request.body);
          return reply.send(tokens);
        } catch (error) {
          return handleError(error, reply);
        }
      }
    );

    app.post(
      "/auth/refresh",
      { schema: { body: refreshTokenSchema } },
      async (request, reply) => {
        try {
          const tokens = await authService.refresh(request.body.refreshToken);
          return reply.send(tokens);
        } catch (error) {
          return handleError(error, reply);
        }
      }
    );

    app.post(
      "/auth/logout",
      { schema: { body: refreshTokenSchema } },
      async (request, reply) => {
        try {
          await authService.logout(request.body.refreshToken);
          return reply.status(204).send();
        } catch (error) {
          return handleError(error, reply);
        }
      }
    );

    // Protected profile routes
    app.addHook("preHandler", async (request, reply) => {
      if (request.url.startsWith("/auth/me")) {
        await authenticate(request, reply, authService);
      }
    });

    app.get(
      "/auth/me",
      async (request, reply) => {
        try {
          const user = await authService.getUserById(request.user.sub);
          if (!user) return reply.status(404).send({ error: "User not found" });
          const { passwordHash, ...safeUser } = user;
          return safeUser;
        } catch (error) {
          return handleError(error, reply);
        }
      }
    );

    app.patch<{ Body: z.infer<typeof updateProfileSchema> }>(
      "/auth/me",
      { schema: { body: updateProfileSchema } },
      async (request, reply) => {
        try {
          const user = await authService.updateProfile(request.user.sub, request.body);
          const { passwordHash, ...safeUser } = user;
          return safeUser;
        } catch (error) {
          return handleError(error, reply);
        }
      }
    );

    // Admin-only routes
    app.addHook("preHandler", async (request, reply) => {
      if (request.url.startsWith("/users")) {
        await authenticate(request, reply, authService);
        if (request.user && !["admin"].includes(request.user.role)) {
          return reply.status(403).send({ error: "Insufficient permissions" });
        }
      }
    });

    app.get("/users", async () => {
      const users = await authService.getAllUsers();
      return users.map(({ passwordHash, ...safe }) => safe);
    });

    app.get<{ Params: { id: string } }>(
      "/users/:id",
      async (request, reply) => {
        try {
          const user = await authService.getUserById(request.params.id);
          if (!user) return reply.status(404).send({ error: "User not found" });
          const { passwordHash, ...safe } = user;
          return safe;
        } catch (error) {
          return handleError(error, reply);
        }
      }
    );

    app.delete<{ Params: { id: string } }>(
      "/users/:id",
      async (request, reply) => {
        try {
          await authService.deleteUser(request.params.id);
          return reply.status(204).send();
        } catch (error) {
          return handleError(error, reply);
        }
      }
    );
  };
}
