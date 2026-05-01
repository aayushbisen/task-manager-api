import { FastifyPluginAsync } from "fastify";
import { sqlite } from "../db/connection";

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/health",
    {
      schema: {
        tags: ["Health"],
        summary: "Health check",
        description: "Returns the current status of the API and database",
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string" },
              timestamp: { type: "string" },
              database: { type: "string" },
            },
          },
          503: {
            type: "object",
            properties: {
              status: { type: "string" },
              timestamp: { type: "string" },
              database: { type: "string" },
              error: { type: "string" },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      try {
        sqlite.prepare("SELECT 1").get();
        return {
          status: "ok",
          timestamp: new Date().toISOString(),
          database: "connected",
        };
      } catch (error) {
        return reply.status(503).send({
          status: "degraded",
          timestamp: new Date().toISOString(),
          database: "disconnected",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  fastify.get<{
    Querystring: { name?: string };
  }>(
    "/hello",
    {
      schema: {
        tags: ["Health"],
        summary: "Greeting",
        description: "Returns a personalized greeting",
        querystring: {
          type: "object",
          properties: {
            name: { type: "string", default: "world" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request) => {
      const name = request.query.name ?? "world";
      return { message: `Hello, ${name}!` };
    }
  );
};
