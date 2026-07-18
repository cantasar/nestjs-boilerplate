variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "service_label" {
  description = "Human label used in SA display names/descriptions (cosmetic)."
  type        = string
  default     = "app"
}

variable "runtime_sa_account_id" {
  description = "account_id (local part) for the runtime service account."
  type        = string
}

variable "cicd_sa_account_id" {
  description = "account_id (local part) for the CI/CD service account."
  type        = string
}

variable "runtime_bucket_names" {
  description = "GCS buckets the runtime SA gets objectUser on (bucket-scoped, not project-wide)."
  type        = list(string)
  default     = []
}

variable "cicd_invoker_services" {
  description = "Cloud Run service names the CI/CD SA is allowed to invoke."
  type        = list(string)
  default     = []
}
