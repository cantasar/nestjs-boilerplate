# NestJS Boilerplate

Ready-to-use NestJS template for backend projects. Auth, DB, Redis, and Mail infrastructure included.

## Requirements

- **Node.js** 22+ (compatible with `.nvmrc`)
- **PostgreSQL** (Docker or local)
- **Redis** (Docker or local)

## Setup

[pnpm](https://pnpm.io) is the package manager (`corepack enable` uses the version from `packageManager` in `package.json`).

```bash
# Dependencies
pnpm install

# Environment variables
cp .env.example .env
# Edit .env file

# Database (optional - for local dev)
docker compose up -d

# Migration (use DATABASE_URL if using Neon/Cloud SQL)
pnpm run db:push

# Start
pnpm run start:dev
```

## Environment Variables

| Variable            | Required | Default                | Description                                                      |
| ------------------- | -------- | ---------------------- | ---------------------------------------------------------------- |
| `JWT_SECRET`        | **Yes**  | -                      | JWT signing key                                                  |
| `DATABASE_URL`      | No       | -                      | PostgreSQL URL (otherwise HOST/PORT/USER/PASSWORD/NAME are used) |
| `DATABASE_HOST`     | No       | localhost              |                                                                  |
| `DATABASE_PORT`     | No       | 5432                   |                                                                  |
| `DATABASE_USER`     | No       | postgres               |                                                                  |
| `DATABASE_PASSWORD` | No       | ''                     |                                                                  |
| `DATABASE_NAME`     | No       | app                    |                                                                  |
| `REDIS_URL`         | No       | redis://localhost:6379 |                                                                  |
| `ZEPTOMAIL_URL`     | No       | -                      | Mail (for forgot-password)                                       |
| `ZEPTOMAIL_TOKEN`   | No       | -                      |                                                                  |
| `MAIL_FROM_ADDRESS` | No       | -                      |                                                                  |
| `MAIL_FROM_NAME`    | No       | -                      |                                                                  |
| `SWAGGER_ENABLED`   | No       | (on)                   | Set `false` to disable OpenAPI UI                                |
| `SWAGGER_BASIC_AUTH_USER` / `SWAGGER_BASIC_AUTH_PASSWORD` | **Yes in production** | - | HTTP Basic for `/api/docs` (browser login before Swagger UI) |

## Endpoints

| Endpoint                     | Description                   |
| ---------------------------- | ----------------------------- |
| `GET /health`                | Liveness (load balancer)      |
| `GET /health/ready`          | Readiness (DB + Redis status) |
| `POST /api/v1/auth/register` | Register                      |
| `POST /api/v1/auth/login`    | Login                         |
| `POST /api/v1/auth/refresh`  | Token refresh                 |
| `GET /api/v1/todos`          | Todo list (Bearer token)      |
| `POST /api/v1/todos`         | Create todo                   |

**Swagger UI:** http://localhost:3000/api/docs · **OpenAPI JSON:** http://localhost:3000/api/docs/openapi.json  
In **production**, set `SWAGGER_BASIC_AUTH_USER` and `SWAGGER_BASIC_AUTH_PASSWORD` (required). Optionally set the same in development to protect docs locally.

## Commands

```bash
pnpm run start:dev    # Development
pnpm run build        # Build
pnpm run lint         # Oxlint
pnpm run format       # Oxfmt
pnpm run test         # Unit test
pnpm run test:e2e     # E2E test
pnpm run db:generate  # Generate migration files to ./drizzle
pnpm run db:migrate   # Apply generated migrations
pnpm run db:push      # Apply schema to DB
pnpm run db:studio    # Drizzle Studio
```

## Project Structure

```
src/
├── auth/          # JWT auth, register, login, forgot/reset password
├── users/         # User repository
├── todos/         # Example module (can be removed)
├── database/      # Drizzle schema + module
├── mail/          # ZeptoMail
├── redis/         # Redis module + RedisService facade
├── health/        # Health check
├── common/        # Guards, filters, decorators
└── common/config/ # Env validation
```
