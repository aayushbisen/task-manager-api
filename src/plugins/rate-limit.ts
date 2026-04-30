import { FastifyPluginAsync } from "fastify";
import fastifyRateLimit from "@fastify/rate-limit";

export const rateLimitPlugin: FastifyPluginAsync = async (server) => {
  await server.register(fastifyRateLimit, {
    max: 100,
    timeWindow: "1 minute",
    keyGenerator: (request) => request.ip,
    errorResponseBuilder: (request, context) => ({
      error: "Too Many Requests",
      message: `Rate limit exceeded. Try again in ${Math.ceil(Number(String(context.after).replace("s", "")) * 1000)}s.`,
      requestId: request.id,
      timestamp: new Date().toISOString(),
    }),
  });

  server.addHook("onRoute", (routeOptions) => {
    if (routeOptions.url?.startsWith("/auth")) {
      routeOptions.config = {
        ...routeOptions.config,
        rateLimit: { max: 10, timeWindow: "1 minute" },
      };
    }
  });
};
