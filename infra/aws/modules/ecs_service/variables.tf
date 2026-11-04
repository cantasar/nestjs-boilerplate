variable "cluster_name" {
  type = string
}

variable "service_name" {
  description = "ECS service name. Also the task definition family and log group name."
  type        = string
}

variable "container_name" {
  description = "Container name in the task definition. The Deploy workflow swaps this one's image."
  type        = string
  default     = "api"
}

variable "region" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "assign_public_ip" {
  description = "True for public subnets without NAT (needed to pull images and reach the internet)."
  type        = bool
  default     = true
}

variable "alb_security_group_id" {
  type = string
}

variable "target_group_arn" {
  type = string
}

variable "container_port" {
  type    = number
  default = 3000
}

variable "cpu" {
  type    = number
  default = 256
}

variable "memory" {
  type    = number
  default = 512
}

variable "cpu_architecture" {
  description = "X86_64 matches GitHub's default runners. ARM64 is cheaper but needs an arm64 image."
  type        = string
  default     = "X86_64"
}

variable "desired_count" {
  type    = number
  default = 1
}

variable "health_check_grace_period" {
  description = "Seconds before ALB health checks count. Covers the DB wait and migrations on start."
  type        = number
  default     = 120
}

variable "bootstrap_image" {
  description = "Image for the first task definition. CI replaces it on every deploy."
  type        = string
}

variable "execution_role_arn" {
  type = string
}

variable "task_role_arn" {
  type = string
}

variable "env" {
  description = "Plain env vars."
  type        = map(string)
  default     = {}
}

variable "secret_env" {
  description = "Env var name to Secrets Manager ARN."
  type        = map(string)
  default     = {}
}

variable "log_retention_days" {
  type    = number
  default = 30
}
