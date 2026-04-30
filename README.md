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
| `GET` | `/tasks` | Bearer | List tasks (user's own, all for admin) |
| `POST` | `/tasks` | Bearer | Create a task |
| `GET` | `/tasks/:id` | Bearer | Get task by ID |
| `PATCH` | `/tasks/:id` | Bearer | Update a task |
| `DELETE` | `/tasks/:id` | Bearer | Delete a task |

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
