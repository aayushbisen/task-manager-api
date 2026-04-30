import { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/health", async () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
  }));

  fastify.get<{
    Querystring: { name?: string };
  }>(
    "/hello",
    async (request) => {
      const name = request.query.name ?? "world";
      return { message: `Hello, ${name}!` };
    }
  );
};
