######################################################################
# Example root module — copy this whole `example/` directory to a new
# `envs/<env>/`, fill in `terraform.tfvars` (see `terraform.tfvars.example`),
# and go. See infra/README.md for the full runbook + safety model.
#
# The modules under `../../modules/` are project-agnostic; every
# project-specific value lives in this root + terraform.tfvars.
######################################################################

locals {
  # VPC/PSA/egress-subnet only exist to give Cloud SQL/Memorystore a private
  # IP and Cloud Run a path to it — not its own variable (would be
  # speculative configurability with no independent use case).
  enable_private_networking = var.enable_cloud_sql || var.enable_memorystore

  # Non-secret runtime env. Only takes effect once manage_api_template = true.
  # PORT is deliberately NOT here — Cloud Run reserves it (auto-set from
  # container_port), rejects the whole update if it's passed explicitly.
  runtime_env = {
    NODE_ENV = "production"
  }

  # Secret env → Secret Manager refs (version defaults to "latest"). This is
  # the MINIMAL required set for this boilerplate (see .env.example) — add
  # more of the app's optional/feature-flagged vars here the same way as you
  # adopt them (ZEPTOMAIL_*, GOOGLE_CLIENT_ID, API_KEY, FIRST_ADMIN_*, ...).
  runtime_secret_env = {
    DATABASE_URL           = { secret = "app-database-url" }
    REDIS_URL              = { secret = "app-redis-url" }
    JWT_SECRET             = { secret = "app-jwt-secret" }
    JWT_EXPIRATION         = { secret = "app-jwt-expiration" }
    JWT_REFRESH_EXPIRATION = { secret = "app-jwt-refresh-expiration" }
  }

  # Secret Manager ids to create — derived from runtime_secret_env so
  # there's a single source of truth (a secret added there always gets
  # created here too; no separate list to remember to update).
  secret_names = distinct([for v in local.runtime_secret_env : v.secret])
}

module "iam" {
  source     = "../../modules/iam"
  project_id = var.project_id
  region     = var.region

  runtime_sa_account_id = "app-runtime"
  cicd_sa_account_id    = "app-cicd"
  runtime_bucket_names  = var.runtime_bucket_names
  cicd_invoker_services = [var.api_service_name]
}

module "network" {
  source     = "../../modules/network"
  count      = local.enable_private_networking ? 1 : 0
  project_id = var.project_id
  region     = var.region

  vpc_name         = var.vpc_name
  runtime_sa_email = module.iam.runtime_sa_email
  # Greenfield default: allocate a fresh PSA peering range. Set false if
  # you're adopting a project that already has one (see README runbook).
  create_psa_connection = true
}

module "cloud_sql" {
  source     = "../../modules/cloud_sql"
  count      = var.enable_cloud_sql ? 1 : 0
  project_id = var.project_id
  region     = var.data_region

  instance_name = var.cloud_sql_instance_name
  # database_version not overridden — module default (POSTGRES_17) is the
  # safer, more broadly-available choice for a fresh instance. Override only
  # if you know your region/edition needs otherwise.
  tier          = var.cloud_sql_tier
  vpc_self_link = one(module.network[*].vpc_self_link)
}

module "memorystore" {
  source     = "../../modules/memorystore"
  count      = var.enable_memorystore ? 1 : 0
  project_id = var.project_id
  region     = var.data_region

  instance_name      = var.memorystore_instance_name
  authorized_network = one(module.network[*].vpc_id)
  # auth_enabled/transit_encryption_mode default to hardened (true/
  # SERVER_AUTHENTICATION) for a fresh instance — leave them unless
  # adopting an existing instance that was provisioned without either
  # (see the root README's "Data-plane toggles" section).
}

module "secrets" {
  source     = "../../modules/secrets"
  project_id = var.project_id
  region     = var.region

  secret_names     = local.secret_names
  runtime_sa_email = module.iam.runtime_sa_email
}

module "artifact_registry" {
  source        = "../../modules/artifact_registry"
  project_id    = var.project_id
  region        = var.region
  repository_id = var.artifact_registry_repo
}

module "cloud_run_api" {
  source     = "../../modules/cloud_run_service"
  project_id = var.project_id
  region     = var.region

  service_name    = var.api_service_name
  manage_template = var.manage_api_template

  # Template config — only applied when manage_template = true.
  image           = var.bootstrap_image
  service_account = module.iam.runtime_sa_email
  container_port  = 8080
  min_instances   = 0
  max_instances   = 2
  cpu_idle        = true

  # ALL_TRAFFIC needs a Cloud Router + Cloud NAT to reach the public
  # internet from inside the VPC — this module does NOT provision one.
  # PRIVATE_RANGES_ONLY (default) lets public-IP destinations (external
  # APIs, an external DB/Redis if you disabled the toggles above) bypass
  # the VPC connector entirely, which is almost always what you want.
  # Don't change this without provisioning Cloud NAT first.
  enable_vpc_access       = local.enable_private_networking
  egress_subnet_self_link = local.enable_private_networking ? one(module.network[*].egress_subnet_id) : ""
  vpc_egress              = "PRIVATE_RANGES_ONLY"
  cloudsql_instances      = module.cloud_sql[*].connection_name

  startup_probe_path  = "/health/ready"
  liveness_probe_path = "/health"

  env        = local.runtime_env
  secret_env = local.runtime_secret_env
}

module "migrate_job" {
  source = "../../modules/cloud_run_job"
  count  = var.enable_migrate_job ? 1 : 0

  project_id = var.project_id
  region     = var.region

  job_name        = "app-migrate"
  bootstrap_image = var.bootstrap_image
  command         = ["node", "dist/src/migrate.js"]
  service_account = module.iam.runtime_sa_email

  enable_vpc_access       = local.enable_private_networking
  egress_subnet_self_link = local.enable_private_networking ? one(module.network[*].egress_subnet_id) : ""
  vpc_egress              = "PRIVATE_RANGES_ONLY"
  cloudsql_instances      = module.cloud_sql[*].connection_name

  env        = local.runtime_env
  secret_env = local.runtime_secret_env
}

module "lb" {
  source = "../../modules/lb_serverless_neg"
  count  = var.enable_lb ? 1 : 0

  project_id             = var.project_id
  region                 = var.region
  name_prefix            = "app"
  domain                 = var.api_domain
  cloud_run_service_name = module.cloud_run_api.service_name
}
