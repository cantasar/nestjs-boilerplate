# NestJS Boilerplate

Ready-to-use NestJS template for backend projects. Auth, DB, Redis, and Mail infrastructure included.

## Requirements

- **Node.js** 20+ (compatible with `.nvmrc`)
- **PostgreSQL** (Docker or local)
- **Redis** (Docker or local)

## Setup

```bash
# Dependencies
npm install

# Environment variables
cp .env.example .env
# Edit .env file

# Database (optional - for local dev)
docker compose up -d

# Migration (use DATABASE_URL if using Neon/Cloud SQL)
npm run db:push

# Start
npm run start:dev
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | **Yes** | - | JWT signing key |
| `DATABASE_URL` | No | - | PostgreSQL URL (otherwise HOST/PORT/USER/PASSWORD/NAME are used) |
| `DATABASE_HOST` | No | localhost | |
| `DATABASE_PORT` | No | 5432 | |
| `DATABASE_USER` | No | postgres | |
| `DATABASE_PASSWORD` | No | '' | |
| `DATABASE_NAME` | No | app | |
| `REDIS_URL` | No | redis://localhost:6379 | |
| `ZEPTOMAIL_URL` | No | - | Mail (for forgot-password) |
| `ZEPTOMAIL_TOKEN` | No | - | |
| `MAIL_FROM_ADDRESS` | No | - | |
| `MAIL_FROM_NAME` | No | - | |

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Liveness (load balancer) |
| `GET /health/ready` | Readiness (DB + Redis status) |
| `POST /api/v1/auth/register` | Register |
| `POST /api/v1/auth/login` | Login |
| `POST /api/v1/auth/refresh` | Token refresh |
| `GET /api/v1/todos` | Todo list (Bearer token) |
| `POST /api/v1/todos` | Create todo |

**Swagger:** http://localhost:3000/docs

## Commands

```bash
npm run start:dev    # Development
npm run build        # Build
npm run lint         # ESLint
npm run format       # Prettier
npm run test         # Unit test
npm run test:e2e     # E2E test
npm run db:generate  # Generate migration
npm run db:push      # Apply schema to DB
npm run db:studio    # Drizzle Studio
```

## Project Structure

```
src/
├── auth/          # JWT auth, register, login, forgot/reset password
├── users/         # User repository
├── todos/         # Example module (can be removed)
├── database/      # Drizzle schema + module
├── mail/          # ZeptoMail
├── redis/         # Redis client
├── health/        # Health check
├── common/        # Guards, filters, decorators
└── config/        # Env validation
```
