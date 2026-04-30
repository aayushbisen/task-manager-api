import { FastifyPluginAsync } from "fastify";

export const errorHandlerPlugin: FastifyPluginAsync = async (server) => {
  server.setErrorHandler((error, request, reply) => {
    const isProd = process.env.NODE_ENV === "production";
    const statusCode = (error as any).statusCode ?? 500;
    const message =
      isProd && statusCode >= 500
        ? "An unexpected error occurred"
        : String((error as any).message || "Internal Server Error");
    const errorLabel =
      statusCode >= 400 && statusCode < 500
        ? String((error as any).message)
        : "Internal Server Error";

    const baseResponse: Record<string, unknown> = {
      error: errorLabel,
      message,
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };

    if (isDev() && error instanceof Error && error.stack) {
      baseResponse.stack = error.stack;
    }

    if (statusCode >= 500) {
      request.log.error({ err: error, requestId: request.id }, "unhandled error");
    } else {
      request.log.warn({ err: error, statusCode, requestId: request.id }, "client error");
    }

    return reply.status(statusCode).send(baseResponse);
  });
};

function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}
