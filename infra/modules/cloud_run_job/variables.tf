variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "job_name" {
  type    = string
  default = "migrate"
}

variable "bootstrap_image" {
  description = "Bootstrap image URI used to seed the Job. Cloud Build's migrate-update step rewrites this on every push; image is ignored by lifecycle so TF and CI don't fight."
  type        = string
}

variable "command" {
  type    = list(string)
  default = ["/app/start-migrate.sh"]
}

variable "service_account" {
  description = "Runtime service account email."
  type        = string
}

variable "enable_vpc_access" {
  description = "Attach Direct VPC Egress. Set false for default public egress — no private-IP dependency, e.g. a fully external DB/Redis reached over the public internet."
  type        = bool
  default     = true
}

variable "egress_subnet_self_link" {
  description = "Self-link of the egress subnet for Direct VPC Egress. Required when enable_vpc_access = true."
  type        = string
  default     = ""
}

variable "vpc_egress" {
  description = "VPC egress setting: PRIVATE_RANGES_ONLY or ALL_TRAFFIC. Ignored when enable_vpc_access = false."
  type        = string
  default     = "PRIVATE_RANGES_ONLY"
}

variable "cpu" {
  type    = string
  default = "1"
}

variable "memory" {
  type    = string
  default = "1Gi"
}

variable "task_timeout_seconds" {
  type    = number
  default = 600
}

variable "max_retries" {
  type    = number
  default = 1
}

variable "cloudsql_instances" {
  description = "Cloud SQL connection names mounted as /cloudsql volume."
  type        = list(string)
  default     = []
}

variable "env" {
  type    = map(string)
  default = {}
}

variable "secret_env" {
  type = map(object({
    secret  = string
    version = optional(string, "latest")
  }))
  default = {}
}

variable "secret_volumes" {
  type = map(object({
    secret  = string
    version = optional(string, "latest")
  }))
  default = {}
}
