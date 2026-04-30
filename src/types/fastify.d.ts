import type { JwtPayload } from "../auth/schema.zod";

declare module "fastify" {
  interface FastifyRequest {
    user: JwtPayload;
  }
}
