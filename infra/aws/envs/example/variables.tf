######################################################################
# Account / region / naming.
######################################################################

variable "region" {
  description = "AWS region, e.g. eu-central-1."
  type        = string
}

variable "name" {
  description = "Short app name used in every resource name (lowercase, max ~20 chars)."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,19}$", var.name))
    error_message = "name must be 2-20 chars: lowercase letters, digits and dashes, starting with a letter."
  }
}

variable "tags" {
  description = "Extra tags for every resource."
  type        = map(string)
  default     = {}
}

variable "vpc_cidr_block" {
  type    = string
  default = "10.20.0.0/16"
}

######################################################################
# GitHub deploy access (OIDC, no stored AWS keys).
######################################################################

variable "github_repository" {
  description = "GitHub repo allowed to deploy, as \"owner/name\"."
  type        = string
}

variable "github_environment" {
  description = "The one GitHub environment (staging or production) allowed to deploy this stack."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+$", var.github_environment))
    error_message = "github_environment must be one environment name, like staging or production."
  }
}

variable "create_github_oidc_provider" {
  description = "False if this AWS account already has the GitHub OIDC provider."
  type        = bool
  default     = true
}

######################################################################
# App service.
######################################################################

variable "bootstrap_image" {
  description = "Image for the first task definition. CI replaces it on every deploy."
  type        = string
}

variable "desired_count" {
  description = "Running tasks. Start with 0, deploy once, then set 1+ (see README)."
  type        = number
  default     = 0
}

variable "cpu" {
  type    = number
  default = 256
}

variable "memory" {
  type    = number
  default = 512
}

variable "cors_origin" {
  description = "Comma list of allowed origins. Empty = none in production."
  type        = string
  default     = ""
}

variable "certificate_arn" {
  description = "ACM certificate ARN for HTTPS on the ALB. Empty = HTTP only."
  type        = string
  default     = ""
}

variable "alb_deletion_protection" {
  type    = bool
  default = false
}

######################################################################
# Data-plane toggles. Off = bring your own DATABASE_URL / REDIS_URL
# (Neon, Supabase, Upstash, ...). See README before turning one off
# again: prevent_destroy blocks it on purpose.
######################################################################

variable "enable_rds" {
  description = "Provision RDS Postgres."
  type        = bool
  default     = false
}

variable "rds_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "rds_multi_az" {
  type    = bool
  default = false
}

variable "enable_elasticache" {
  description = "Provision ElastiCache (Valkey)."
  type        = bool
  default     = false
}

variable "elasticache_node_type" {
  type    = string
  default = "cache.t4g.micro"
}
