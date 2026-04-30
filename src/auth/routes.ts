import { FastifyPluginAsync } from "fastify";
import type { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "@fastify/type-provider-zod";
import type { AuthService } from "./service";
import { registerSchema, loginSchema, updateProfileSchema } from "./schema.zod";
import { createAuthenticateMiddleware } from "./middleware";
import { handleError } from "../common/error-handler";
import { errorSchema, tokensSchema, userSchema } from "../common/schemas";
import { z } from "zod";

type RegisterBody = z.infer<typeof registerSchema>;
type LoginBody = z.infer<typeof loginSchema>;
const refreshTokenSchema = z.object({
  refreshToken: z.string(),
});

type RefreshBody = z.infer<typeof refreshTokenSchema>;

const usersListSchema = {
  type: "array" as const,
  items: userSchema,
};

const openApiSchemas = {
  register: {
    tags: ["Auth"],
    summary: "Register a new user",
    description: "Creates a new user account and returns access + refresh tokens",
    body: registerSchema,
    response: {
      201: tokensSchema,
      400: errorSchema,
      409: errorSchema,
    },
  },
  login: {
    tags: ["Auth"],
    summary: "Login",
    description: "Authenticate with email and password, returns access + refresh tokens",
    body: loginSchema,
    response: {
      200: tokensSchema,
      400: errorSchema,
    },
  },
  refresh: {
    tags: ["Auth"],
    summary: "Refresh tokens",
    description: "Rotate refresh token to get a new access + refresh token pair",
    body: refreshTokenSchema,
    response: {
      200: tokensSchema,
      400: errorSchema,
    },
  },
  logout: {
    tags: ["Auth"],
    summary: "Logout",
    description: "Revoke a refresh token, invalidating the session",
    body: refreshTokenSchema,
    response: {
      204: { description: "No content" },
      400: errorSchema,
    },
  },
  getProfile: {
    tags: ["Auth"],
    summary: "Get current user profile",
    description: "Returns the authenticated user's profile information",
    security: [{ bearerAuth: [] }],
    response: {
      200: userSchema,
      401: errorSchema,
      404: errorSchema,
    },
  },
  updateProfile: {
    tags: ["Auth"],
    summary: "Update profile",
    description: "Update name, email, or change password for the authenticated user",
    security: [{ bearerAuth: [] }],
    body: updateProfileSchema,
    response: {
      200: userSchema,
      400: errorSchema,
      401: errorSchema,
    },
  },
  listUsers: {
    tags: ["Admin"],
    summary: "List all users",
    description: "Returns a list of all registered users. Admin only.",
    security: [{ bearerAuth: [] }],
    response: {
      200: usersListSchema,
      401: errorSchema,
      403: errorSchema,
    },
  },
  getUser: {
    tags: ["Admin"],
    summary: "Get user by ID",
    description: "Returns a specific user's profile. Admin only.",
    security: [{ bearerAuth: [] }],
    response: {
      200: userSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
  },
  deleteUser: {
    tags: ["Admin"],
    summary: "Delete a user",
    description: "Permanently deletes a user account. Admin only.",
    security: [{ bearerAuth: [] }],
    response: {
      204: { description: "No content" },
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
  },
};

export function createAuthRoutes(authService: AuthService): FastifyPluginAsync {
  return async (fastify: FastifyInstance) => {
    const app = fastify.withTypeProvider<ZodTypeProvider>();
    const authenticate = createAuthenticateMiddleware(authService);

    app.post<{ Body: RegisterBody }>(
      "/auth/register",
      { schema: openApiSchemas.register },
      async (request, reply) => {
        try {
          const tokens = await authService.register(request.body);
          return reply.status(201).send(tokens);
        } catch (error) {
          return handleError(error, reply);
        }
      }
    );

    app.post<{ Body: LoginBody }>(
      "/auth/login",
      { schema: openApiSchemas.login },
      async (request, reply) => {
        try {
          const tokens = await authService.login(request.body);
          return reply.send(tokens);
        } catch (error) {
          return handleError(error, reply);
        }
      }
    );

    app.post<{ Body: RefreshBody }>(
      "/auth/refresh",
      { schema: openApiSchemas.refresh },
      async (request, reply) => {
        try {
          const tokens = await authService.refresh(request.body.refreshToken);
          return reply.send(tokens);
        } catch (error) {
          return handleError(error, reply);
        }
      }
    );

    app.post<{ Body: RefreshBody }>(
      "/auth/logout",
      { schema: openApiSchemas.logout },
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
        await authenticate(request, reply);
      }
    });

    app.get(
      "/auth/me",
      { schema: openApiSchemas.getProfile },
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
      { schema: openApiSchemas.updateProfile },
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
        await authenticate(request, reply);
        if (request.user && !["admin"].includes(request.user.role)) {
          return reply.status(403).send({ error: "Insufficient permissions" });
        }
      }
    });

    app.get("/users", { schema: openApiSchemas.listUsers }, async () => {
      const users = await authService.getAllUsers();
      return users.map(({ passwordHash, ...safe }) => safe);
    });

    app.get<{ Params: { id: string } }>(
      "/users/:id",
      { schema: openApiSchemas.getUser },
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
      { schema: openApiSchemas.deleteUser },
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
