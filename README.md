# Task Manager API

A full-featured task management REST API built with Fastify, TypeScript, and SQLite, featuring user authentication, role-based access control, and a clean layered architecture.

## Features

- **User Authentication** — Register, login, JWT access + refresh tokens
- **Task CRUD** — Create, read, update, delete tasks with ownership
- **Role-Based Access** — Users see only their tasks; admins see all + manage users
- **Token Rotation** — Refresh token rotation with reuse detection
- **Password Security** — argon2id hashing
- **Input Validation** — Zod schemas shared between runtime and TypeScript types
- **SQLite Database** — Drizzle ORM with migrations
- **API Documentation** — Auto-generated OpenAPI 3.0.3 spec with Scalar UI at `/docs`
- **Rate Limiting** — Two-tier: 10 req/min on auth routes, 100 req/min default
- **Structured Logging** — Pino (JSON in production, pretty-printed in development)
- **Global Error Handler** — Consistent error responses with request IDs
- **CORS** — Configurable allowed origins via environment variable
- **Graceful Shutdown** — Clean drain on `SIGTERM` / `SIGINT`

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js + TypeScript (strict) |
| Framework | Fastify |
| Validation | Zod + custom schema compiler |
| Database | SQLite (better-sqlite3) |
| ORM | Drizzle ORM |
| Auth | JWT (jsonwebtoken) + argon2 |
| Testing | Vitest |
| Docs | `@fastify/swagger` + `@scalar/fastify-api-reference` |

## Prerequisites

- Node.js 18+
- npm

## Getting Started

```bash
# Install dependencies
npm install

# Push database schema
npm run db:push

# Run in development (ts-node)
npm run dev

# Build for production
npm run build

# Start production server
npm run start
```

## Configuration

| Env Variable | Default | Description |
|-------------|---------|-------------|
| `PORT` | `3000` | Server port |
| `DB_PATH` | `tasks.db` | SQLite database file path |
| `JWT_SECRET` | `dev-secret-change-in-production` | JWT signing key |
| `ALLOWED_ORIGINS` | `*` | Comma-separated CORS allowed origins |
| `NODE_ENV` | `development` | Environment (`development` or `production`) |
| `RATE_LIMIT_DISABLED` | `false` | Disable rate limiting (dev only) |

## API Endpoints

### Auth

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `POST` | `/auth/register` | — | Register new user |
| `POST` | `/auth/login` | — | Login, returns tokens |
| `POST` | `/auth/refresh` | Refresh token | Rotate refresh token |
| `POST` | `/auth/logout` | Refresh token | Revoke refresh token |
| `GET` | `/auth/me` | Bearer | Get current user profile |
| `PATCH` | `/auth/me` | Bearer | Update profile / change password |

### Tasks

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET` | `/tasks` | Bearer | List tasks (paginated, filterable, sortable) |
| `POST` | `/tasks` | Bearer | Create a task |
| `GET` | `/tasks/:id` | Bearer | Get task by ID |
| `PATCH` | `/tasks/:id` | Bearer | Update a task |
| `DELETE` | `/tasks/:id` | Bearer | Delete a task |

#### GET /tasks Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | `1` | Page number (min 1) |
| `limit` | number | `20` | Items per page (max 100) |
| `done` | boolean | — | Filter by completion status |
| `priority` | string | — | Filter by priority (`low`, `medium`, `high`) |
| `search` | string | — | Search in title and description |
| `orderBy` | string | `createdAt` | Sort field (`createdAt`, `title`, `priority`, `dueDate`) |
| `order` | string | `desc` | Sort direction (`asc`, `desc`) |

**Response format:**
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "totalPages": 3
  }
}
```

### Admin

| Method | Route | Auth | Role |
|--------|-------|------|------|
| `GET` | `/users` | Bearer | admin |
| `GET` | `/users/:id` | Bearer | admin |
| `DELETE` | `/users/:id` | Bearer | admin |

### Health

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/hello?name=` | Greeting endpoint |

## API Documentation

Interactive API documentation is available when the server is running:

- **Scalar UI** — http://localhost:3000/docs
- **OpenAPI Spec** — http://localhost:3000/openapi.json

Endpoints are grouped by tag: Auth, Tasks, Admin, Health. Bearer token authentication can be tested directly in the UI.

## Error Responses

All errors return a consistent JSON format:

```json
{
  "error": "TaskNotFound",
  "message": "Task not found",
  "requestId": "abc123",
  "timestamp": "2026-04-30T12:00:00.000Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `error` | string | Machine-readable error code |
| `message` | string | Human-readable description |
| `requestId` | string | Unique ID for tracing (from `x-request-id` header) |
| `timestamp` | string | ISO 8601 timestamp |
| `stack` | string | Stack trace (development only) |

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| `400` | Validation error or bad request |
| `401` | Missing or invalid authentication |
| `403` | Insufficient permissions |
| `404` | Resource not found |
| `409` | Conflict (e.g., duplicate email, email in use) |
| `429` | Rate limit exceeded |
| `500` | Internal server error |

## Rate Limiting

Two tiers of rate limiting are applied:

| Tier | Limit | Window | Applies To |
|------|-------|--------|------------|
| Default | 100 requests | 60 seconds | All routes |
| Auth | 10 requests | 60 seconds | `/auth/*` routes |

When rate limited, responses include `Retry-After` header and a `429` status:

```json
{
  "error": "TooManyRequests",
  "message": "Rate limit exceeded, retry in 60 seconds",
  "requestId": "abc123",
  "timestamp": "2026-04-30T12:00:00.000Z"
}
```

Rate limiting is automatically disabled during tests (when `VITEST` env var is set).

## Logging

Structured logging via Pino:

- **Development** (`NODE_ENV=development`): Pretty-printed, human-readable output at `debug` level
- **Production** (`NODE_ENV=production`): JSON output at `info` level

Sensitive fields (`password`, `token`, `authorization`, `passwordHash`) are automatically redacted. Each request is logged with a unique `requestId` (from `x-request-id` header or auto-generated).

## CORS

CORS is configured via the `ALLOWED_ORIGINS` environment variable:

```bash
# Single origin
ALLOWED_ORIGINS=https://example.com

# Multiple origins (comma-separated)
ALLOWED_ORIGINS=https://example.com,https://admin.example.com
```

Defaults to `*` (all origins) when not set. The `x-request-id` header is always exposed to clients.

## Graceful Shutdown

The server handles `SIGTERM` and `SIGINT` signals to gracefully shut down:
1. Stops accepting new connections
2. Waits for in-flight requests to complete
3. Closes database connections
4. Exits the process

This ensures zero-downtime deployments and clean process termination in containerized environments.

## Database

```bash
# Push schema directly to DB (development)
npm run db:push

# Generate a migration file
npm run db:generate

# Apply pending migrations
npm run db:migrate

# Open Drizzle Studio (DB GUI)
npm run db:studio
```

## Testing

```bash
# Watch mode
npm run test

# Single run (CI)
npm run test:run

# Typecheck
npx tsc --noEmit
```

## Architecture

```
src/
  errors/          # Custom error classes
  common/          # Shared JSON schemas for OpenAPI responses
  types/           # TypeScript type augmentations (Fastify modules)
  auth/            # Authentication feature
    repository.ts  # IAuthRepository + Drizzle impl
    service.ts     # AuthService (business logic)
    routes.ts      # /auth/* + /users/* endpoints
    schema.zod.ts  # Zod validation schemas
    middleware.ts  # authenticate() + requireRole()
  tasks/           # Tasks feature
    repository.ts  # ITaskRepository + Drizzle impl
    service.ts     # TaskService (scoped by owner)
    routes.ts      # /tasks/* endpoints
    schema.zod.ts  # Zod validation schemas
  health/          # Health check routes
  db/              # Data layer
    schema.ts      # Table definitions (users, tasks, refreshTokens)
    connection.ts  # SQLite + Drizzle instance
  index.ts         # createServer() — dependency injection
```

## Design Patterns

- **Repository Pattern** — Data access abstracted behind interfaces
- **Service Layer** — Business logic decoupled from routes
- **Manual Dependency Injection** — Wires repo → service → routes in `createServer()`
- **Zod Validation** — Shared schemas for runtime validation + TypeScript types
- **Feature Folders** — Each feature contains its own routes, service, repository, and schemas
- **OpenAPI Generation** — Zod schemas converted to JSON Schema via `toJSONSchema()` in swagger transform hook

## License

MIT
