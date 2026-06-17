# Deployment

The app ships as a single container image built from a multi-stage [`Dockerfile`](../Dockerfile). It runs migrations on boot and starts the compiled server. Use a managed PostgreSQL (Neon / Cloud SQL / Supabase) and Redis in production; [`docker-compose.yml`](../docker-compose.yml) is for **local development only**.

## Container image

The Dockerfile is a Node 24 multi-stage build:

| Stage | Purpose |
|-------|---------|
| `base` | `node:24-alpine`, enables corepack and the pinned pnpm |
| `deps` | full install (with dev deps) for the build |
| `builder` | `pnpm run build` → `dist/` |
| `prod-deps` | production-only `node_modules` |
| `runner` | copies `node_modules`, `dist`, `drizzle`, `package.json`, and `entrypoint.sh`; runs as a non-root `app` user |

Runtime defaults: `NODE_ENV=production`, `PORT=3000`, source maps enabled. An optional Sentry release tag is wired via `--build-arg GIT_SHA=$COMMIT_SHA`. The entrypoint runs under `dumb-init` for correct signal handling.

```bash
docker build -t my-service .
docker run --rm -p 3000:3000 --env-file .env my-service
```

## Local services (docker-compose)

`docker compose up -d` starts **PostgreSQL 16** (`5432`) and **Redis 7** (`6379`), both with health checks. Defaults match `.env.example` (`postgres`/`postgres`, database `app`). This is for local dev — do not use it as your production datastore.

## Entrypoint & migrations

[`scripts/entrypoint.sh`](../scripts/entrypoint.sh) runs on container start:

1. **Wait for the database** — polls `SELECT 1` for up to ~60s before giving up.
2. **Run migrations** — when `RUN_MIGRATIONS` is `true` (the default), applies the Drizzle migrations in `./drizzle`. A PostgreSQL **advisory lock** serializes migration across replicas, so only one booting instance migrates while the rest wait. Set `RUN_MIGRATIONS=false` to skip (e.g. when a separate migration job owns it).
3. **Start the app** — `node dist/src/main.js`.

> Migration files are not committed. Generate them with `pnpm db:generate` at merge/deploy time so `./drizzle` ships with the image; otherwise the migrate step is a no-op.

## Configuration

Inject configuration via environment variables — never bake secrets into the image. See the README's env table and [`.env.example`](../.env.example) for the full grouped list (core, database, JWT, Redis, queue, mail, OAuth, storage, SMS, push, swagger). `JWT_SECRET` is required; most integrations are conditional and stay dormant until their flag variable is set. The Zod env schema validates configuration at boot and fails fast on invalid values.

For production also set:

- `NODE_ENV=production`
- `CORS_ORIGIN` — comma-separated allowed origins
- `SWAGGER_ENABLED=true` only if you intend to expose the docs (default-deny in production), ideally behind `SWAGGER_BASIC_AUTH_USER` / `_PASSWORD`

## Runtime hardening & shutdown

`main.ts` enables Helmet, CORS, a configurable body-parser limit, `trust proxy`, and `app.enableShutdownHooks()` for graceful shutdown — combined with `dumb-init`, the process drains cleanly on `SIGTERM`. `GET /health` (liveness) and `GET /health/ready` (DB + Redis readiness) are unversioned and suitable for load-balancer / orchestrator probes.

## CI/CD (example: Google Cloud Run)

The repository includes a GitHub Actions workflow at `.github/workflows/` for building and deploying to Cloud Run. One-time setup:

1. **Artifact Registry** — create a Docker repository:
   ```bash
   gcloud artifacts repositories create cloud-run \
     --repository-format=docker --location=europe-west1
   ```
2. **Service account** — create `github-actions` with `roles/run.admin`, `roles/artifactregistry.writer`, and `roles/iam.serviceAccountUser`, then create a key.
3. **GitHub secrets** — add `GCP_PROJECT_ID` and `GCP_SA_KEY` (the full `key.json` contents).
4. **Deploy** — run the workflow manually (Actions → Run workflow) or on push to `main`.

Cloud Run / managed Postgres handle the rest; the in-container migration step keeps the schema current on each release.
