# Values for the GitHub environment variables (see infra/aws/README.md).
output "github_vars" {
  value = {
    AWS_REGION             = var.region
    AWS_DEPLOY_ROLE_ARN    = module.iam.deploy_role_arn
    AWS_ECR_REPOSITORY_URL = module.ecr.repository_url
    AWS_ECS_CLUSTER        = module.ecs_service.cluster_name
    AWS_ECS_SERVICE        = module.ecs_service.service_name
    AWS_ECS_CONTAINER_NAME = module.ecs_service.container_name
  }
}

output "alb_dns_name" {
  value = module.alb.dns_name
}

output "alb_zone_id" {
  value = module.alb.zone_id
}

output "log_group_name" {
  value = module.ecs_service.log_group_name
}

output "secret_arns" {
  value = module.secrets.arns
}

output "rds_address" {
  value = one(module.rds[*].address)
}

output "rds_master_user_secret_arn" {
  value = one(module.rds[*].master_user_secret_arn)
}

output "elasticache_endpoint" {
  value = one(module.elasticache[*].primary_endpoint)
}
