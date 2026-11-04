# infra/aws — Terraform (AWS)

Project-agnostic Terraform for ECS Fargate + ALB + ECR + Secrets Manager + GitHub OIDC deploy
role, with optional RDS Postgres and ElastiCache (Valkey). Modules under `modules/` carry **no
project-specific values**. Everything specific lives in your own `envs/<env>/`.

Shared basics (deploy switch, container, migrations on start, production env): [`../README.md`](../README.md).

## How it fits together

- **Terraform** (this folder) builds the infra: VPC, ALB, ECS cluster + service + first task definition, ECR, secret shells, IAM roles.
- **GitHub "Deploy" workflow** ([`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml), `aws` job) builds the image, pushes it to ECR, copies the latest task definition with the new image and rolls the service. The service ignores `task_definition` in Terraform, so the two never fight.
- **Env or secret list changed in Terraform?** `terraform apply` makes a new task definition revision. It reaches the running app on the next Deploy run.

```
infra/aws/
├── envs/example/     # copy to envs/<env>/, fill in terraform.tfvars
└── modules/
    ├── network/      # VPC, 2 public + 2 private subnets, no NAT
    ├── ecr/          # image repo, immutable tags, scan on push, keep last 20
    ├── secrets/      # Secrets Manager shells (no values)
    ├── iam/          # execution role, task role, GitHub OIDC deploy role
    ├── alb/          # public ALB, HTTP → HTTPS when a cert is set
    ├── ecs_service/  # cluster, log group, task definition, service (circuit breaker + rollback)
    ├── rds/          # optional private Postgres 17
    └── elasticache/  # optional private Valkey, TLS, noeviction (for BullMQ)
```

## Security model

- **No stored AWS keys.** GitHub gets short-lived credentials through OIDC. Each stack's deploy role trusts only one environment, `repo:<owner>/<repo>:environment:<github_environment>`, and can only push to its ECR repo and update its one ECS service. A staging run can never use the production role.
- **One stack per environment.** `envs/staging` and `envs/production` each have their own `name`, `github_environment` and state key.
- **No NAT gateway.** Tasks run in public subnets with a public IP (for ECR, Secrets Manager and external APIs) but their security group only lets in the ALB on port 3000.
- **RDS and Valkey** sit in private subnets with no internet route. Only the task security group can reach them. The RDS master password is managed by RDS in Secrets Manager, so it never lands in Terraform state.
- **Valkey has no AUTH token** (that would put a secret in state). Access is by security group + TLS. Add RBAC users if you need more.

## Data-plane toggles

`enable_rds` / `enable_elasticache` default to `false`: bring your own DB and Redis (Neon,
Supabase, Upstash, ...). Put the real URLs into the `<name>/database-url` and `<name>/redis-url`
secrets yourself.

When on:
- **RDS** forces SSL. Build `DATABASE_URL` from the `rds_address` output and the RDS-managed secret (`rds_master_user_secret_arn`), and add `?sslmode=no-verify` (encrypted, cert not checked), or ship the [RDS CA bundle](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL.html) via `NODE_EXTRA_CA_CERTS` and use `sslmode=verify-full`.
- **Valkey** needs TLS: `REDIS_URL=rediss://<elasticache_endpoint>:6379`.

⚠️ Both have `prevent_destroy` (RDS also `deletion_protection`). Turning one off on a live
instance fails on purpose. Detach it from state first, then delete it by hand once the app runs on
its replacement.

## Runbook — greenfield

### 1 — state bucket (once per account)
```bash
aws s3api create-bucket --bucket <your-project>-tfstate --region <region> \
  --create-bucket-configuration LocationConstraint=<region>
aws s3api put-bucket-versioning --bucket <your-project>-tfstate --versioning-configuration Status=Enabled
aws s3api put-public-access-block --bucket <your-project>-tfstate \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

### 2 — first apply (no tasks yet)
Do this once per environment. Copy `envs/example/` to `envs/<env>/` (`envs/staging`,
`envs/production`), copy `terraform.tfvars.example` to `terraform.tfvars` and fill it in. Give each
env its own `name` (like `api-staging`, `api-prod`) and set `github_environment` to that env. If two
envs share one AWS account, set `create_github_oidc_provider = false` in the second one.
Keep `desired_count = 0`: ECR is empty, so there is nothing to run yet.

```bash
cd envs/<env>
terraform init \
  -backend-config="bucket=<your-project>-tfstate" \
  -backend-config="key=<env>/terraform.tfstate" \
  -backend-config="region=<region>"
terraform apply
```

### 3 — secret values
```bash
aws secretsmanager put-secret-value --secret-id <name>/jwt-secret --secret-string "$VALUE"
```
Do this for every secret in `runtime_secrets` (`main.tf`): `database-url`, `redis-url`,
`jwt-secret`, `jwt-expiration`, `jwt-refresh-expiration`. Tasks read them when they start.

### 4 — GitHub setup
- Repository variable `DEPLOY_TARGET` = `aws`.
- In each GitHub environment, add the variables from `terraform output github_vars` of **that env's stack**
  (`envs/staging` → `staging`, `envs/production` → `production`):
  `AWS_REGION`, `AWS_DEPLOY_ROLE_ARN`, `AWS_ECR_REPOSITORY_URL`, `AWS_ECS_CLUSTER`, `AWS_ECS_SERVICE`, `AWS_ECS_CONTAINER_NAME`.
- On `production`, add required reviewers and set "Deployment branches" to the default branch only.

### 5 — first deploy, then scale up
Run the **Deploy** workflow. It pushes the image and registers a task definition with it. Then set
`desired_count = 1` (or more) and `terraform apply` again.

### 6 — validate
`http://<alb_dns_name>/health/ready` is green, migrations ran (see the `log_group_name` log
group), mail works if configured. For HTTPS: request an ACM certificate, set `certificate_arn`,
apply, and point your DNS at the ALB (`alb_dns_name` / `alb_zone_id`).
