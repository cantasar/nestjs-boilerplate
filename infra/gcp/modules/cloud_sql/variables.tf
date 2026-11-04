variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "instance_name" {
  type    = string
  default = "postgres"
}

variable "vpc_self_link" {
  description = "Self-link of the VPC peered to PSA; used by ip_configuration.private_network."
  type        = string
}

variable "database_version" {
  type    = string
  default = "POSTGRES_17"
}

variable "tier" {
  type    = string
  default = "db-g1-small"
}
