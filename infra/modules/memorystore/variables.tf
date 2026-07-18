variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "instance_name" {
  type    = string
  default = "redis"
}

variable "tier" {
  type    = string
  default = "BASIC"
}

variable "memory_size_gb" {
  type    = number
  default = 1
}

variable "redis_version" {
  type    = string
  default = "REDIS_7_2"
}

variable "authorized_network" {
  description = "Self-link or ID of the VPC authorized for PSA peering."
  type        = string
}

variable "auth_enabled" {
  description = "Require an AUTH string to connect. Secure default for a fresh instance; set false only to match an already-provisioned instance created without it (flipping this on an existing instance forces replacement)."
  type        = bool
  default     = true
}

variable "transit_encryption_mode" {
  description = "TLS in transit. Secure default for a fresh instance; set \"DISABLED\" only to match an already-provisioned instance created without it (changing this on an existing instance forces replacement)."
  type        = string
  default     = "SERVER_AUTHENTICATION"
}
