# Task Manager API — Context

## Glossary

- **Access Token** — Short-lived JWT used to authenticate requests (expires in 15 minutes)
- **Refresh Token** — Long-lived token stored in DB, used to rotate access tokens (expires in 7 days)
- **Token Rotation** — Each refresh generates a new access + refresh pair; old refresh is invalidated
- **Owner** — The user who created a task; only owners (and admins) can access their tasks
- **Admin** — A user with `role: "admin"` who can view/delete all users and tasks
- **Request ID** — Unique correlation ID attached to every request log entry and error response
- **Rate Limit Tier** — Two tiers: `auth` (stricter, 10 req/min) and `default` (100 req/min)

## Architecture

### Plugin-based infrastructure

Infrastructure concerns are extracted as Fastify plugins in `src/plugins/`. Each plugin is independently testable and registers itself on the server via `server.register()`.

**Important:** `setValidatorCompiler` must be called directly on the root server, not inside a plugin. Fastify plugin encapsulation prevents validator compilers set inside plugins from being visible to routes registered outside that plugin's scope.

### Dependency flow

```
index.ts (composer)
  → plugins (cors, rate-limit, swagger, error-handler, request-id)
  → repository → service → authenticate middleware → routes
```

### Cross-feature boundaries

- `tasks/` receives an `AuthenticateFn` (middleware), not `AuthService` — no cross-feature coupling
- `auth/` owns authentication types, middleware, and all auth logic
- `common/` holds truly shared concerns: error handler, OpenAPI schemas
- `errors/` defines AppError base class and all error subclasses

## Production Guardrails

- **CORS**: Configurable via `ALLOWED_ORIGINS` env var; defaults to `*` in all environments
- **Rate Limiting**: Two tiers — auth routes (10/min), all others (100/min), per IP
- **Error Responses**: Consistent `{ error, message, requestId, timestamp }` format; `stack` only in dev
- **Logging**: Pino structured logging with sensitive field redaction; `info` in prod, `debug` in dev
