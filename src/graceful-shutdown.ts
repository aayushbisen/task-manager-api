import type { FastifyInstance } from "fastify";

export function registerGracefulShutdown(server: FastifyInstance): void {
  const shutdown = async () => {
    server.log.info("Shutting down gracefully...");
    await server.close();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
