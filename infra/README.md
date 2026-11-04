# infra — Terraform (GCP or AWS)

Pick one cloud per project. Both folders have the same shape: generic `modules/` and an
`envs/example/` to copy to `envs/<env>/`.

| Cloud | Runs on | Guide |
|---|---|---|
| GCP | Cloud Run (+ optional Cloud SQL, Memorystore) | [`gcp/README.md`](gcp/README.md) |
| AWS | ECS Fargate + ALB (+ optional RDS, ElastiCache Valkey) | [`aws/README.md`](aws/README.md) |

Delete the folder you do not use.

## Deploy switch (off by default)

This is a scaffold, so a fresh copy never deploys. The manual GitHub **Deploy** workflow
([`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)) reads the **repository**
variable `DEPLOY_TARGET`:

| `DEPLOY_TARGET` | What the Deploy workflow does |
|---|---|
| unset / anything else | Fails at once with "Deploy is off". Nothing is built or shipped. |
| `gcp` | Builds the image, pushes to Artifact Registry, deploys Cloud Run |
| `aws` | Builds the image, pushes to ECR, rolls the ECS service |

Set it under Settings → Secrets and variables → Actions → Variables. Make it a repository
variable (a job-level `if` cannot see environment variables). Never set it at org level: every
fresh copy in the org would then deploy. Per-environment values go in the GitHub environments
`staging` and `production`. On `production`, add required reviewers and set "Deployment branches"
to the default branch only (the workflow can run from any branch).

Humans deploy. AI agents in this repo never run `terraform apply` or the Deploy workflow.

## Shared basics

**App container** ([`../Dockerfile`](../Dockerfile)): Node 26 Alpine, multi-stage build, runs as a non-root user under `dumb-init`. Local test run:

```bash
docker build -t api .
docker run --rm -p 3000:3000 --env-file <your-env-file> api
```

**On start** ([`../scripts/entrypoint.sh`](../scripts/entrypoint.sh)): waits up to 60s for the database, runs Drizzle migrations (a Postgres advisory lock lets only one replica migrate; set `RUN_MIGRATIONS=false` to skip), then starts the app. Migration files are not committed: run `pnpm db:generate` before you build a release image.

**Production env:** set `NODE_ENV=production`, a random `JWT_SECRET` (32+ characters), `CORS_ORIGIN`, and the database / Redis / mail values through the cloud's secret store. Swagger stays off in production unless `SWAGGER_ENABLED=true` (use basic auth then). Probes: `GET /health` (alive) and `GET /health/ready` (DB + Redis).
