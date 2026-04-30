import type { FastifyReply } from "fastify";
import { AppError } from "../errors";

export function handleError(error: unknown, reply: FastifyReply) {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({ error: error.message });
  }
  throw error;
}
