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

Feature-folded layers: `auth/`, `tasks/`, `health/`, `errors/`, `common/`, `types/`, `db/`

## Production Guardrails

- **CORS**: Configurable via `ALLOWED_ORIGINS` env var; defaults to `*` in all environments
- **Rate Limiting**: Two tiers — auth routes (10/min), all others (100/min), per IP
- **Error Responses**: Consistent `{ error, message, requestId, timestamp }` format; `stack` only in dev
- **Logging**: Pino structured logging with sensitive field redaction; `info` in prod, `debug` in dev
