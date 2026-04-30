import { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/health",
    {
      schema: {
        tags: ["Health"],
        summary: "Health check",
        description: "Returns the current status of the API",
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string" },
              timestamp: { type: "string" },
            },
          },
        },
      },
    },
    async () => ({
      status: "ok",
      timestamp: new Date().toISOString(),
    })
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
