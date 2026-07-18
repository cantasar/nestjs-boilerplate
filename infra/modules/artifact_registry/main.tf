######################################################################
# Artifact Registry docker repo. Vulnerability scanning + cleanup policy.
#
# Scanning is project-scoped (Container Analysis API). We enable it
# here so the repo gets coverage without a separate ops step.
######################################################################

resource "google_project_service" "container_analysis" {
  project            = var.project_id
  service            = "containeranalysis.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "container_scanning" {
  project            = var.project_id
  service            = "containerscanning.googleapis.com"
  disable_on_destroy = false
}

######################################################################
# the app repo — keep last 10 untagged + delete untagged > 30 days.
######################################################################

resource "google_artifact_registry_repository" "this" {
  project       = var.project_id
  location      = var.region
  repository_id = var.repository_id
  format        = "DOCKER"

  # Run cleanup for real (not dry-run). Flip to true if you need to
  # preview a policy change before letting it delete artifacts.
  cleanup_policy_dry_run = false

  cleanup_policies {
    id     = "keep-latest-10-untagged"
    action = "KEEP"
    most_recent_versions {
      package_name_prefixes = []
      keep_count            = 10
    }
  }

  cleanup_policies {
    id     = "delete-untagged-older-than-30d"
    action = "DELETE"
    condition {
      tag_state  = "UNTAGGED"
      older_than = "2592000s" # 30 days
    }
  }

  lifecycle {
    ignore_changes = [
      description,
      labels,
      kms_key_name,
      mode,
      docker_config,
      remote_repository_config,
      virtual_repository_config,
    ]
  }
}
