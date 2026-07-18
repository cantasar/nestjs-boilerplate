######################################################################
# Service accounts.
#
# Two purpose-built SAs, replacing the project's Compute Engine default
# SA for the runtime + CI/CD paths.
######################################################################

resource "google_service_account" "runtime" {
  project      = var.project_id
  account_id   = var.runtime_sa_account_id
  display_name = "${var.service_label} runtime (Cloud Run + Cloud Run Jobs)"
  description  = "Workload SA for ${var.service_label}. Cloud SQL + Secret Manager + GCS-bucket-scoped object access only."
}

resource "google_service_account" "cicd" {
  project      = var.project_id
  account_id   = var.cicd_sa_account_id
  display_name = "${var.service_label} CI/CD"
  description  = "CI deploy SA (e.g. GitHub Actions). Pushes images, deploys revisions, and impersonates the runtime SA — no broad project-level roles."
}

######################################################################
# Runtime SA — project-level roles.
#
# - cloudsql.client       : open IAM-authenticated connections to the
#                           Cloud SQL instance (Cloud SQL Auth path).
# - logging.logWriter     : Cloud Run revisions need this to emit logs
#                           once the default SA is replaced.
# - monitoring.metricWriter : same story for metrics.
######################################################################

locals {
  runtime_project_roles = [
    "roles/cloudsql.client",
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
  ]
}

resource "google_project_iam_member" "runtime_project" {
  for_each = toset(local.runtime_project_roles)

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

######################################################################
# Runtime SA — GCS bucket-scoped object access.
# objectUser covers read/write/delete on objects without granting
# bucket-admin or project-level storage roles.
######################################################################

resource "google_storage_bucket_iam_member" "runtime_buckets" {
  for_each = toset(var.runtime_bucket_names)

  bucket = each.value
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.runtime.email}"
}

######################################################################
# CI/CD SA — project-level roles.
#
# - run.developer            : deploy + manage Cloud Run services/jobs
# - artifactregistry.writer  : push images to AR
# - logging.logWriter        : CI job step logs
#
# No Cloud Build roles — this template's CI ships images via a plain
# `docker build`/`docker push` + `gcloud run deploy` (e.g. GitHub Actions),
# not Cloud Build. Add `roles/cloudbuild.builds.editor` +
# `roles/storage.objectViewer` (build-bucket source archives) back only if
# you actually wire up Cloud Build triggers.
######################################################################

locals {
  cicd_project_roles = [
    "roles/run.developer",
    "roles/artifactregistry.writer",
    "roles/logging.logWriter",
  ]
}

resource "google_project_iam_member" "cicd_project" {
  for_each = toset(local.cicd_project_roles)

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.cicd.email}"
}

######################################################################
# CI/CD SA — scoped impersonation of the runtime SA.
# Required so Cloud Run deploys can set --service-account=<runtime>.
# Granted on the runtime SA resource only (NOT project-wide).
######################################################################

resource "google_service_account_iam_member" "cicd_impersonates_runtime" {
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.cicd.email}"
}

######################################################################
# CI/CD SA — per-service run.invoker.
# Lets the CI pipeline call the service (smoke tests, traffic migration
# RPCs) without granting project-wide run.invoker.
######################################################################

resource "google_cloud_run_v2_service_iam_member" "cicd_invoker" {
  for_each = toset(var.cicd_invoker_services)

  project  = var.project_id
  location = var.region
  name     = each.value
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.cicd.email}"
}
