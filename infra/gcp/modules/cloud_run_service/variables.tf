variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "service_name" {
  type = string
}

######################################################################
# Two modes:
#   manage_template = false → import shell: keep the placeholder container
#     and ignore everything under `template`; the live revision is whatever
#     CI last deployed. Use while adopting an existing service.
#   manage_template = true  → Terraform owns the revision template (service
#     account, scaling, vpc_access, env, secret env, volumes, command).
######################################################################

variable "manage_template" {
  description = "If true, Terraform owns the revision template. If false, template is ignored (adopt an existing/CI-deployed service)."
  type        = bool
  default     = false
}

variable "ingress" {
  description = "Ingress: INGRESS_TRAFFIC_ALL (public) or INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER (LB-only)."
  type        = string
  default     = "INGRESS_TRAFFIC_ALL"
}

variable "allow_unauthenticated" {
  description = "If true, grants roles/run.invoker to allUsers (public). Set false for internal/LB-fronted services."
  type        = bool
  default     = true
}

variable "image" {
  description = "Container image URI. Required when manage_template = true."
  type        = string
  default     = ""
}

variable "command" {
  description = "Container command override. Required when manage_template = true."
  type        = list(string)
  default     = []
}

variable "service_account" {
  description = "Runtime service account email. Required when manage_template = true."
  type        = string
  default     = ""
}

variable "min_instances" {
  description = "Scaling min."
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "Scaling max. Set to 0 to keep the service deployed but inert."
  type        = number
  default     = 1
}

variable "cpu" {
  description = "CPU per instance (e.g. \"1\", \"2\")."
  type        = string
  default     = "1"
}

variable "memory" {
  description = "Memory per instance (e.g. \"512Mi\", \"1Gi\")."
  type        = string
  default     = "512Mi"
}

variable "cpu_idle" {
  description = "If false, allocates CPU always (request + background). Worker/beat need always-on CPU."
  type        = bool
  default     = true
}

variable "container_port" {
  description = "Container HTTP port (set even for non-HTTP services — Cloud Run requires it)."
  type        = number
  default     = 8000
}

variable "timeout_seconds" {
  description = "Request timeout in seconds."
  type        = number
  default     = 300
}

variable "enable_vpc_access" {
  description = "Attach Direct VPC Egress. Set false for default public egress — no private-IP dependency, e.g. a fully external DB/Redis reached over the public internet."
  type        = bool
  default     = true
}

variable "egress_subnet_self_link" {
  description = "Self-link of the egress subnet for Direct VPC Egress. Required when manage_template = true and enable_vpc_access = true."
  type        = string
  default     = ""
}

variable "vpc_egress" {
  description = "VPC egress setting: PRIVATE_RANGES_ONLY or ALL_TRAFFIC. Ignored when enable_vpc_access = false."
  type        = string
  default     = "PRIVATE_RANGES_ONLY"
}

variable "cloudsql_instances" {
  description = "List of Cloud SQL connection names (project:region:instance) attached as Cloud SQL volume."
  type        = list(string)
  default     = []
}

variable "env" {
  description = "Plain (non-secret) env vars."
  type        = map(string)
  default     = {}
}

variable "secret_env" {
  description = "Secret env vars: key = ENV name, value = { secret = secret_id, version = \"latest\" }."
  type = map(object({
    secret  = string
    version = optional(string, "latest")
  }))
  default = {}
}

variable "secret_volumes" {
  description = "Secret volumes mounted as files. Each entry mounts ONE secret to /secrets/<name> as a file named <name>."
  type = map(object({
    secret  = string
    version = optional(string, "latest")
  }))
  default = {}
}

variable "startup_probe_path" {
  description = "HTTP path for startup probe. Empty disables."
  type        = string
  default     = "/health/live"
}

variable "liveness_probe_path" {
  description = "HTTP path for liveness probe. Empty disables."
  type        = string
  default     = "/health/live"
}

variable "session_affinity" {
  description = "Enable session affinity (cookie-based)."
  type        = bool
  default     = false
}

variable "execution_environment" {
  description = "EXECUTION_ENVIRONMENT_GEN1 or EXECUTION_ENVIRONMENT_GEN2."
  type        = string
  default     = "EXECUTION_ENVIRONMENT_GEN2"
}

variable "max_instance_request_concurrency" {
  description = "Max concurrent requests per instance."
  type        = number
  default     = 80
}
