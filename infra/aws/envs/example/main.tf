######################################################################
# Example root module. Copy this folder to `envs/<env>/`, fill in
# `terraform.tfvars` (see `terraform.tfvars.example`) and go.
# See infra/aws/README.md for the runbook.
######################################################################

locals {
  cluster_name   = var.name
  service_name   = "${var.name}-api"
  container_port = 3000

  # Plain runtime env. PORT must match the container port.
  runtime_env = merge(
    {
      NODE_ENV = "production"
      PORT     = tostring(local.container_port)
    },
    var.cors_origin != "" ? { CORS_ORIGIN = var.cors_origin } : {},
  )

  # Env var → secret name (under "<name>/"). Minimal set for this boilerplate;
  # add optional ones (ZEPTOMAIL_*, API_KEY, ...) here the same way.
  runtime_secrets = {
    DATABASE_URL           = "database-url"
    REDIS_URL              = "redis-url"
    JWT_SECRET             = "jwt-secret"
    JWT_EXPIRATION         = "jwt-expiration"
    JWT_REFRESH_EXPIRATION = "jwt-refresh-expiration"
  }
}

module "network" {
  source     = "../../modules/network"
  name       = var.name
  cidr_block = var.vpc_cidr_block
}

module "ecr" {
  source          = "../../modules/ecr"
  repository_name = var.name
}

module "secrets" {
  source       = "../../modules/secrets"
  name_prefix  = "${var.name}/"
  secret_names = distinct(values(local.runtime_secrets))
}

module "iam" {
  source      = "../../modules/iam"
  name_prefix = var.name

  secret_arns        = values(module.secrets.arns)
  ecr_repository_arn = module.ecr.repository_arn
  ecs_cluster_name   = local.cluster_name
  ecs_service_name   = local.service_name

  github_repository           = var.github_repository
  github_environment          = var.github_environment
  create_github_oidc_provider = var.create_github_oidc_provider
}

module "alb" {
  source = "../../modules/alb"
  name   = var.name

  vpc_id                     = module.network.vpc_id
  vpc_cidr_block             = var.vpc_cidr_block
  public_subnet_ids          = module.network.public_subnet_ids
  container_port             = local.container_port
  health_check_path          = "/health"
  certificate_arn            = var.certificate_arn
  enable_deletion_protection = var.alb_deletion_protection
}

module "ecs_service" {
  source = "../../modules/ecs_service"

  cluster_name = local.cluster_name
  service_name = local.service_name
  region       = var.region

  vpc_id                = module.network.vpc_id
  subnet_ids            = module.network.public_subnet_ids
  assign_public_ip      = true
  alb_security_group_id = module.alb.security_group_id
  target_group_arn      = module.alb.target_group_arn
  container_port        = local.container_port

  cpu             = var.cpu
  memory          = var.memory
  desired_count   = var.desired_count
  bootstrap_image = var.bootstrap_image

  execution_role_arn = module.iam.execution_role_arn
  task_role_arn      = module.iam.task_role_arn

  env        = local.runtime_env
  secret_env = { for env_name, secret in local.runtime_secrets : env_name => module.secrets.arns[secret] }

  # The target group must be attached to a listener before the service uses it.
  depends_on = [module.alb]
}

module "rds" {
  source = "../../modules/rds"
  count  = var.enable_rds ? 1 : 0

  identifier                 = "${var.name}-db"
  vpc_id                     = module.network.vpc_id
  subnet_ids                 = module.network.private_subnet_ids
  allowed_security_group_ids = [module.ecs_service.task_security_group_id]
  instance_class             = var.rds_instance_class
  multi_az                   = var.rds_multi_az
}

module "elasticache" {
  source = "../../modules/elasticache"
  count  = var.enable_elasticache ? 1 : 0

  name                       = "${var.name}-cache"
  vpc_id                     = module.network.vpc_id
  subnet_ids                 = module.network.private_subnet_ids
  allowed_security_group_ids = [module.ecs_service.task_security_group_id]
  node_type                  = var.elasticache_node_type
}
