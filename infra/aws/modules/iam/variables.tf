variable "name_prefix" {
  type = string
}

variable "secret_arns" {
  description = "Secrets Manager ARNs the execution role may read."
  type        = list(string)
  default     = []
}

variable "ecr_repository_arn" {
  type = string
}

variable "ecs_cluster_name" {
  type = string
}

variable "ecs_service_name" {
  type = string
}

variable "github_repository" {
  description = "GitHub repo allowed to deploy, as \"owner/name\"."
  type        = string
}

variable "github_environment" {
  description = "The one GitHub environment (workflow `environment:`) allowed to assume the deploy role."
  type        = string
}

variable "create_github_oidc_provider" {
  description = "False if the account already has the GitHub OIDC provider."
  type        = bool
  default     = true
}
