######################################################################
# Project / region.
######################################################################

variable "project_id" {
  description = "GCP project id (gcloud config get-value project)."
  type        = string
}

variable "region" {
  description = "Region the Cloud Run service runs in."
  type        = string
}

variable "data_region" {
  description = "Region for Cloud SQL + Memorystore (may differ from `region`). Ignored if both are disabled."
  type        = string
}

######################################################################
# Existing (imported) resources — fill in if adopting an already-deployed
# service; leave as-is for a fresh greenfield apply (see README's runbook).
######################################################################

variable "api_service_name" {
  description = "Cloud Run service name."
  type        = string
}

variable "artifact_registry_repo" {
  description = "Artifact Registry docker repo id."
  type        = string
  default     = "cloud-run-source-deploy"
}

######################################################################
# Data-plane toggles. Default true (GCP-managed). Set either false to
# bring your own external DB/Redis (e.g. Neon/Upstash) instead — no VPC
# needed for it. See README's "Data-plane toggles" section before flipping
# either on an already-provisioned instance (prevent_destroy/
# deletion_protection will hard-block it — that's intentional).
######################################################################

variable "enable_cloud_sql" {
  description = "Provision Cloud SQL. False = bring your own DATABASE_URL."
  type        = bool
  default     = true
}

variable "enable_memorystore" {
  description = "Provision Memorystore. False = bring your own REDIS_URL."
  type        = bool
  default     = true
}

######################################################################
# New (greenfield) resource names.
######################################################################

variable "vpc_name" {
  type    = string
  default = "app-vpc"
}

variable "cloud_sql_instance_name" {
  type    = string
  default = "app-db"
}

variable "cloud_sql_tier" {
  type    = string
  default = "db-f1-micro"
}

variable "memorystore_instance_name" {
  type    = string
  default = "app-redis"
}

variable "runtime_bucket_names" {
  description = "GCS buckets the runtime SA gets objectUser on. Leave empty unless GCS_BUCKET is set (storage is optional/feature-flagged in this app — see .env.example)."
  type        = list(string)
  default     = []
}

######################################################################
# Cutover toggles (see README's runbook). Keep manage_api_template false
# until you've imported/verified a pre-existing service, or leave true for
# a fresh greenfield apply (nothing to import yet).
######################################################################

variable "manage_api_template" {
  description = "When true, Terraform owns the full Cloud Run revision template (SA, env, secrets, VPC egress, Cloud SQL volume)."
  type        = bool
  default     = true
}

variable "enable_migrate_job" {
  description = "Create a Cloud Run Job that runs Drizzle migrations."
  type        = bool
  default     = false
}

variable "enable_lb" {
  description = "Create the HTTPS LB + serverless NEG for a custom domain."
  type        = bool
  default     = false
}

variable "api_domain" {
  type    = string
  default = ""
}

variable "bootstrap_image" {
  description = "Image URI to seed the revision template / migrate job (CI overwrites this via ignore_changes on subsequent deploys)."
  type        = string
  default     = ""
}
