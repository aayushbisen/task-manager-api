import { FastifyPluginAsync } from "fastify";
import fastifyCors from "@fastify/cors";

export const corsPlugin: FastifyPluginAsync = async (server) => {
  const allowedOrigins = process.env.ALLOWED_ORIGINS;
  await server.register(fastifyCors, {
    origin: allowedOrigins
      ? allowedOrigins.split(",").map((o) => o.trim())
      : true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-request-id"],
    exposedHeaders: ["x-request-id"],
    credentials: true,
    maxAge: 86400,
  });
};
