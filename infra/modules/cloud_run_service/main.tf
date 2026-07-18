######################################################################
# Cloud Run v2 service module.
#
# Two modes — gated by var.manage_template:
#
#   manage_template = false (adopt existing)
#     Module is a thin import wrapper. Template is left to whatever
#     Cloud Build last deployed; only the bare service shell is owned.
#     Used while adopting a CI-deployed service.
#
#   manage_template = true (Terraform-owned)
#     Module owns the full revision template: image, SA, scaling,
#     vpc_access, env, secrets, volume mounts, command, probes.
#     Used for services whose template Terraform manages.
#
# In both modes `image`, `command`, `client`, `client_version`,
# `traffic`, and `annotations` from CI deploys are tolerated via
# ignore_changes so Cloud Build can keep rolling new images without
# fighting Terraform.
######################################################################

locals {
  # Detect whether either secret mounts or Cloud SQL volumes are present.
  has_secret_volumes = length(var.secret_volumes) > 0
  has_cloudsql       = length(var.cloudsql_instances) > 0
}

######################################################################
# manage_template = false — import shell (template ignored).
######################################################################

# Zero-downtime cutover: when manage_template flips false → true, the
# service lives at `shell[0]` and config wants it at `managed[0]`. This
# `moved` block migrates state instead of DESTROY+CREATE (which would
# recreate the live service — downtime). Only valid to have present while
# manage_template=true everywhere this module is instantiated (Terraform
# rejects a `moved` block whose "from" address can still be produced by the
# current config, which is the case whenever manage_template=false) — remove
# it again if this module ever needs to go back to shell-mode for a fresh
# adoption elsewhere.
moved {
  from = google_cloud_run_v2_service.shell[0]
  to   = google_cloud_run_v2_service.managed[0]
}

resource "google_cloud_run_v2_service" "shell" {
  count = var.manage_template ? 0 : 1

  project  = var.project_id
  location = var.region
  name     = var.service_name

  # Empty container required to satisfy schema; ignored after import.
  template {
    containers {
      image = "placeholder"
    }
  }

  lifecycle {
    ignore_changes = [
      # Managed once manage_template=true / set out-of-band.
      ingress,
      launch_stage,
      labels,
      annotations,
      client,
      client_version,
      description,
      binary_authorization,
      custom_audiences,
      traffic,

      # The whole revision template is owned in managed mode.
      template,
    ]
  }
}

######################################################################
# manage_template = true — full-template ownership.
######################################################################

resource "google_cloud_run_v2_service" "managed" {
  count = var.manage_template ? 1 : 0

  project  = var.project_id
  location = var.region
  name     = var.service_name
  ingress  = var.ingress

  # NOTE: `default_uri_disabled` needs google provider v6.x; this module
  # pins v5. Until bumped, disable the default run.app URL out-of-band:
  #   gcloud beta run services update <service> --region=<region> --default-url-disabled

  template {
    service_account                  = var.service_account
    timeout                          = "${var.timeout_seconds}s"
    execution_environment            = var.execution_environment
    max_instance_request_concurrency = var.max_instance_request_concurrency
    session_affinity                 = var.session_affinity

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    dynamic "vpc_access" {
      for_each = var.enable_vpc_access ? [1] : []
      content {
        egress = var.vpc_egress
        network_interfaces {
          subnetwork = var.egress_subnet_self_link
        }
      }
    }

    containers {
      image   = var.image
      command = var.command

      ports {
        container_port = var.container_port
      }

      resources {
        limits = {
          cpu    = var.cpu
          memory = var.memory
        }
        cpu_idle          = var.cpu_idle
        startup_cpu_boost = true
      }

      dynamic "env" {
        for_each = var.env
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = var.secret_env
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value.secret
              version = env.value.version
            }
          }
        }
      }

      dynamic "volume_mounts" {
        for_each = var.secret_volumes
        content {
          name       = "secret-${volume_mounts.key}"
          mount_path = "/secrets/${volume_mounts.key}"
        }
      }

      dynamic "volume_mounts" {
        for_each = local.has_cloudsql ? [1] : []
        content {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }
      }

      dynamic "startup_probe" {
        for_each = var.startup_probe_path == "" ? [] : [1]
        content {
          initial_delay_seconds = 10
          timeout_seconds       = 5
          period_seconds        = 10
          failure_threshold     = 6
          http_get {
            path = var.startup_probe_path
            port = var.container_port
          }
        }
      }

      dynamic "liveness_probe" {
        for_each = var.liveness_probe_path == "" ? [] : [1]
        content {
          initial_delay_seconds = 30
          timeout_seconds       = 5
          period_seconds        = 30
          failure_threshold     = 3
          http_get {
            path = var.liveness_probe_path
            port = var.container_port
          }
        }
      }
    }

    dynamic "volumes" {
      for_each = var.secret_volumes
      content {
        name = "secret-${volumes.key}"
        secret {
          secret = volumes.value.secret
          items {
            version = volumes.value.version
            path    = volumes.key
            mode    = 0
          }
        }
      }
    }

    dynamic "volumes" {
      for_each = local.has_cloudsql ? [1] : []
      content {
        name = "cloudsql"
        cloud_sql_instance {
          instances = var.cloudsql_instances
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      # Cloud Build rolls new images on every push — Terraform must
      # not fight CI on image SHA.
      template[0].containers[0].image,
      client,
      client_version,
      labels,
      annotations,
      template[0].labels,
      template[0].annotations,
    ]
  }
}

######################################################################
# Public invoker binding — DOCUMENTATION-ONLY (var.allow_unauthenticated).
#
# NOTE: var.allow_unauthenticated is documentation-only here — the
# allUsers → run.invoker binding is managed out-of-band so adopting a
# service that is already public does not create a duplicate binding.
# To lock down, remove the binding out-of-band:
#   gcloud run services remove-iam-policy-binding a worker service \
#     --region=<region> --member=allUsers --role=roles/run.invoker
# and import a `google_cloud_run_v2_service_iam_member` once the API
# has stabilised on the new ingress.
#
# var.allow_unauthenticated is plumbed through env-level so the intent
# is traceable, but is not bound to any resource here.
######################################################################

locals {
  documented_allow_unauthenticated = var.allow_unauthenticated
}
