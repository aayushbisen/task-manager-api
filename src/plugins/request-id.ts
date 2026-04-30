import { FastifyPluginAsync } from "fastify";
import { randomUUID } from "crypto";

export const requestIdPlugin: FastifyPluginAsync = async (server) => {
  server.addHook("onRequest", async (request) => {
    request.id = request.headers["x-request-id"]?.toString() ?? randomUUID();
    request.log.info(
      {
        method: request.method,
        url: request.url,
        remoteAddress: request.ip,
      },
      "incoming request"
    );
  });
};
