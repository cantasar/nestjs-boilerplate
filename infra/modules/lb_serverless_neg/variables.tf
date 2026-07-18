variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "name_prefix" {
  description = "Prefix for all LB / NEG / cert resources."
  type        = string
  default     = "app"
}

variable "domain" {
  description = "Public hostname this LB terminates TLS for."
  type        = string
}

variable "cloud_run_service_name" {
  description = "Name of the Cloud Run v2 service the NEG targets."
  type        = string
}
