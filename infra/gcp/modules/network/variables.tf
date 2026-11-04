variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "vpc_name" {
  type    = string
  default = "vpc"
}

variable "subnet_name" {
  type    = string
  default = "primary-subnet"
}

variable "subnet_cidr" {
  type    = string
  default = "10.0.0.0/24"
}

######################################################################
# Egress subnet + firewall inputs.
######################################################################

variable "egress_subnet_name" {
  type    = string
  default = "egress"
}

variable "egress_subnet_cidr" {
  # /26 = 64 IPs. Direct VPC Egress burns ~1 IP per active Cloud Run instance.
  type    = string
  default = "10.0.10.0/26"
}

variable "psa_destination_cidr" {
  description = "PSA-allocated CIDR for managed services (Cloud SQL, Memorystore)."
  type        = string
  default     = "10.97.0.0/16"
}

variable "runtime_sa_email" {
  description = "Service account email attached as target for the allow-egress-psa rule."
  type        = string
}

variable "extra_allow_egress_psa_sa_emails" {
  description = "Additional service accounts exempted from deny_all_egress for the PSA range — e.g. the SA actually attached to a live, not-yet-cut-over Cloud Run service, so this firewall doesn't cut its Cloud SQL/Redis traffic before cutover."
  type        = list(string)
  default     = []
}

variable "deny_all_egress_firewall_name" {
  type    = string
  default = "deny-all-egress"
}

variable "allow_egress_psa_firewall_name" {
  type    = string
  default = "allow-egress-psa"
}

variable "create_psa_connection" {
  description = "Greenfield: allocate a peering range + create the servicenetworking connection. Set false when importing an existing PSA peering."
  type        = bool
  default     = true
}

variable "psa_range_name" {
  type    = string
  default = "psa-range"
}

variable "psa_prefix_length" {
  description = "Prefix length for the PSA VPC-peering range (e.g. 16 → /16)."
  type        = number
  default     = 16
}
