# infra — Terraform (GCP)

Project-agnostic Terraform for Cloud Run + optional Cloud SQL + optional Memorystore + Secret
Manager + VPC/PSA + serverless LB. The modules under `modules/` carry **no project-specific
values** — everything specific to your project lives in your own `envs/<env>/`.

This ports the same infra used in production for a sibling app (cilt365), generalized: the
Cloud Build trigger module from that setup does **not** get carried over — this repo already has
its own CI/CD (`.github/workflows/deploy-cloud-run.yml`). Terraform here manages the runtime
infra (VPC, DB, cache, secrets, IAM, the Cloud Run service definition); the GitHub Actions
workflow keeps shipping images.

## Layout

```
infra/
├── envs/example/       # copy this to envs/<env>/, fill in terraform.tfvars, go
└── modules/            # generic, reusable modules (drop into any project)
    ├── network/            # VPC + subnet + egress + PSA connection + firewalls
    ├── cloud_sql/          # private-IP Postgres (optional — see toggles below)
    ├── memorystore/        # private-IP Redis, noeviction by default (optional)
    ├── secrets/            # Secret Manager metadata + runtime accessor IAM
    ├── iam/                # runtime + CI/CD service accounts + scoped roles
    ├── artifact_registry/  # docker repo + scanning + cleanup
    ├── cloud_run_service/  # Cloud Run v2 (adopt-shell ↔ managed, zero-downtime)
    ├── cloud_run_job/      # one-shot job (e.g. migrations)
    └── lb_serverless_neg/  # HTTPS LB + serverless NEG + managed cert
```

Prefer the manual GitHub Actions deploy in [`../docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md)? That
stays completely valid — this is an alternative for when you also want Terraform managing the
surrounding infra (DB, cache, secrets, networking), not a replacement.

## Data-plane toggles — Cloud SQL / Memorystore are opt-in

`enable_cloud_sql` / `enable_memorystore` (`envs/example/variables.tf`, both **default `true`** at
the variable level, but the shipped `terraform.tfvars.example` sets both `false`) gate whether
`module.cloud_sql` / `module.memorystore` — and the VPC/PSA/egress-subnet machinery in
`module.network`, which exists only to give them a private IP — get created at all.

The realistic path for a fresh project built on this boilerplate is an **external managed DB/Redis**
(Neon, Supabase, Upstash, ...) reached over the public internet — no VPC, no PSA, no GCP-managed
DB/cache cost. That's the `terraform.tfvars.example` default. When either toggle is `false`:
- `DATABASE_URL` / `REDIS_URL` become bring-your-own — put the real connection string into the
  `app-database-url` / `app-redis-url` Secret Manager secret yourself (the secret resource is
  still created by `module.secrets`; only the managed instance behind it is skipped).
- `cloud_run_api` / `migrate_job`'s `vpc_access` block is dropped entirely (`enable_vpc_access`
  derives from `enable_cloud_sql || enable_memorystore` in `main.tf`) — the service falls back to
  default public egress, same as any Cloud Run service with no networking config at all.

Set either to `true` to have Terraform provision GCP-managed Cloud SQL / Memorystore instead.

⚠️ **Flipping either `true → false` on an already-provisioned instance is deliberately hard-blocked**
— `cloud_sql` / `memorystore` both carry `prevent_destroy = true` (plus Cloud SQL's own
`deletion_protection`), so `terraform plan`/`apply` will hard-error rather than silently destroy
real data. To actually disable one that's already live: `terraform state rm
module.cloud_sql[0].google_sql_database_instance.this` (or the memorystore equivalent) first —
this detaches it from Terraform state **without** touching the live GCP resource — then flip the
variable and re-plan. The now-unmanaged instance still exists in GCP; delete it manually once
you've confirmed the app runs fine against its replacement.

## Safety model

Two starting points, same modules:

- **Greenfield** (no service deployed yet, or deploying fresh alongside this Terraform from day
  one): `manage_api_template = true` from the start. `terraform apply` creates everything,
  including the Cloud Run revision template. No import needed — see the Runbook below.
- **Adopting an already-deployed service** (e.g. you've been shipping via the GitHub Actions
  workflow and now want Terraform to take over): import it as a template-ignored shell first
  (`manage_api_template = false`, `terraform import`), confirm `terraform plan` is a **no-op**,
  apply the new resources (additive, doesn't touch the running service), *then* cut over. See the
  Appendix.

Either way: Cloud SQL / Memorystore (when enabled) have `deletion_protection` / `prevent_destroy`
on — Terraform will refuse to destroy them, full stop.

## Runbook — greenfield (fresh project, nothing deployed yet)

### 1 — bootstrap
```bash
gcloud config get-value project
# create the state bucket (once):
gcloud storage buckets create gs://<your-project>-tfstate --location=<region> \
  --uniform-bucket-level-access --project=<project>
gcloud storage buckets update gs://<your-project>-tfstate --versioning
```
Copy `envs/example/` to `envs/<env>/`, then copy `terraform.tfvars.example` to `terraform.tfvars`
and fill it in — start with the data-plane toggles (above), they shape everything else.

### 2 — init + apply
```bash
cd envs/<env>
terraform init -backend-config="bucket=<your-project>-tfstate" -backend-config="prefix=<env>"
terraform apply
```
This creates the Artifact Registry repo, IAM service accounts, Secret Manager secret shells
(empty — populate real values next), and — if the toggles are `true` — VPC/PSA + Cloud SQL +
Memorystore. `manage_api_template = true` by default in the example, so the Cloud Run service
gets created with its full template in this same apply.

### 3 — populate real secret values
```bash
printf '%s' "$VALUE" | gcloud secrets versions add app-<name> --data-file=-
```
Do this for every secret in `runtime_secret_env` (`main.tf`) — `DATABASE_URL`, `REDIS_URL`,
`JWT_SECRET`, etc. Cloud Run reads `latest` on each new revision.

### 4 — deploy the app
Push an image via the existing GitHub Actions workflow (`.github/workflows/deploy-cloud-run.yml`)
or `gcloud run deploy --image=...`. Terraform's `ignore_changes` on the image field means CI can
keep shipping without fighting Terraform on every apply.

### 5 — validate
`/health/ready` green (DB + Redis reachable if enabled), migrations applied, external APIs
(mail/SMS/Sentry, if configured) reachable.

## Appendix — adopting an already-deployed service

If you've been deploying manually or via CI and want Terraform to take over without downtime:

1. Set `manage_api_template = false` in tfvars first.
2. Import the live pieces (adjust resource addresses/ids to what actually exists):
   ```bash
   cd envs/<env>
   terraform import module.cloud_run_api.google_cloud_run_v2_service.shell[0] \
     "projects/<project>/locations/<region>/services/<service-name>"
   terraform import module.artifact_registry.google_artifact_registry_repository.this \
     "projects/<project>/locations/<region>/repositories/<repo>"
   # + module.network / module.cloud_sql / module.memorystore if those already exist too
   ```
3. `terraform plan -detailed-exitcode` — **must be a no-op** (exit `0`). If it isn't, align
   module defaults / `ignore_changes` to the live values before touching anything else. Do not
   apply with drift unresolved.
4. `terraform apply` — creates only the genuinely new resources (additive, doesn't touch the
   running service).
5. **Cutover**: set `bootstrap_image` to the current live image URI, flip
   `manage_api_template = true`, `terraform apply` → in-place new revision (not destroy+create —
   confirmed by the `moved` block in `modules/cloud_run_service/main.tf`). Roll traffic
   canary → validate → 100%. Rollback: `gcloud run services update-traffic ... --to-revisions=<prev>=100`.

⚠️ Before this last step, check whether the live service uses a Serverless VPC Access connector
rather than Direct VPC Egress (`gcloud run services describe ... --format=yaml` and look for
`run.googleapis.com/vpc-access-connector` vs a `vpcAccess.networkInterfaces` block) — this
module's managed template wires Direct VPC Egress. If they differ, test the switch reaches your
DB/Redis *before* cutover (e.g. deploy a throwaway Cloud Run service on the new egress subnet and
check it can connect), not as a side effect of flipping the toggle.

⚠️ `vpc_egress = "ALL_TRAFFIC"` requires a Cloud Router + Cloud NAT to reach the public internet
from inside the VPC — neither module provisions one. `PRIVATE_RANGES_ONLY` (the default here) lets
public-IP destinations bypass the VPC connector entirely, which is almost always what you want;
don't switch to `ALL_TRAFFIC` without provisioning NAT first.
