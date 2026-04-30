import { FastifyPluginAsync, FastifySchema } from "fastify";
import fastifySwagger from "@fastify/swagger";
import ScalarApiReference from "@scalar/fastify-api-reference";

export const swaggerPlugin: FastifyPluginAsync = async (server) => {
  await server.register(fastifySwagger, {
    openapi: {
      openapi: "3.0.3",
      info: {
        title: "Task Manager API",
        description: "Full-featured task management REST API with user authentication, role-based access control, and JWT tokens.",
        version: "1.0.0",
      },
      servers: [
        {
          url: `http://localhost:${process.env.PORT || 3000}`,
          description: "Local development server",
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description: "Enter your access token (from /auth/login or /auth/register)",
          },
        },
      },
    },
    transform: ({ schema, url }) => {
      const jsonSchema: FastifySchema = { ...schema };
      if (jsonSchema.body && typeof (jsonSchema.body as any).toJSONSchema === "function") {
        (jsonSchema as any).body = (jsonSchema.body as any).toJSONSchema();
      }
      if (jsonSchema.querystring && typeof (jsonSchema.querystring as any).toJSONSchema === "function") {
        (jsonSchema as any).querystring = (jsonSchema.querystring as any).toJSONSchema();
      }
      if (jsonSchema.params && typeof (jsonSchema.params as any).toJSONSchema === "function") {
        (jsonSchema as any).params = (jsonSchema.params as any).toJSONSchema();
      }
      if (jsonSchema.headers && typeof (jsonSchema.headers as any).toJSONSchema === "function") {
        (jsonSchema as any).headers = (jsonSchema.headers as any).toJSONSchema();
      }
      if (jsonSchema.response) {
        for (const key of Object.keys(jsonSchema.response)) {
          const resp = (jsonSchema.response as Record<string, unknown>)[key];
          if (resp && typeof (resp as any).toJSONSchema === "function") {
            (jsonSchema.response as Record<string, unknown>)[key] = (resp as any).toJSONSchema();
          }
        }
      }
      return { schema: jsonSchema, url };
    },
  });

  await server.register(ScalarApiReference, {
    routePrefix: "/docs",
    configuration: {
      title: "Task Manager API",
      url: "/openapi.json",
    },
  });

  server.get("/openapi.json", { schema: { hide: true } }, async () => {
    return server.swagger();
  });
};
