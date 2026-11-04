######################################################################
# Secret Manager secrets.
#
# Terraform owns ONLY the secret metadata + per-secret IAM binding for
# the runtime SA. Secret VERSIONS (the actual values) are populated
# out-of-band — populated out-of-band after apply. Lifecycle ignores
# version-related fields so manual additions never appear in diffs.
#
# All secrets use a single user-managed replica in var.region.
######################################################################

resource "google_secret_manager_secret" "this" {
  for_each = toset(var.secret_names)

  project   = var.project_id
  secret_id = each.value

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  lifecycle {
    ignore_changes = [
      labels,
      annotations,
      version_aliases,
      topics,
      expire_time,
      ttl,
      rotation,
    ]
  }
}

######################################################################
# Per-secret IAM — runtime SA gets secretAccessor on each secret.
# Scoped to the resource, never to the project.
######################################################################

resource "google_secret_manager_secret_iam_member" "runtime_accessor" {
  for_each = toset(var.secret_names)

  project   = var.project_id
  secret_id = google_secret_manager_secret.this[each.key].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.runtime_sa_email}"
}
