######################################################################
# the migrate job — Cloud Run v2 Job.
#
# Cloud Build's migrate-update step rewrites the image to the new
# $SHORT_SHA tag before invoking the job; lifecycle ignores image,
# client, and client_version so Terraform never drifts on CI deploys.
#
# Runs start-migrate.sh: wait_for_db.py → alembic upgrade head.
# Direct VPC Egress + Cloud SQL volume — same connectivity as
# the api service so the migration can talk to private Postgres.
######################################################################

locals {
  has_cloudsql = length(var.cloudsql_instances) > 0
}

resource "google_cloud_run_v2_job" "migrate" {
  project  = var.project_id
  location = var.region
  name     = var.job_name

  template {
    parallelism = 1
    task_count  = 1

    template {
      service_account = var.service_account
      timeout         = "${var.task_timeout_seconds}s"
      max_retries     = var.max_retries

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
        image   = var.bootstrap_image
        command = var.command

        resources {
          limits = {
            cpu    = var.cpu
            memory = var.memory
          }
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
  }

  lifecycle {
    ignore_changes = [
      # Cloud Build's migrate-update step rewrites image per push.
      template[0].template[0].containers[0].image,
      client,
      client_version,
      labels,
      annotations,
      template[0].labels,
      template[0].annotations,
    ]
  }
}
