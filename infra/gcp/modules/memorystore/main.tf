######################################################################
# Memorystore Redis instance.
#
# auth_enabled/transit_encryption_mode are caller-supplied (see
# variables.tf) — default to hardened (AUTH + TLS) for a genuinely fresh
# instance. If adopting an already-live instance provisioned without
# either, override both to match it first (see the root README's
# "Data-plane toggles" / adoption notes) — flipping them on an existing
# instance forces replacement.
#
# prevent_destroy is on: TF must never tear this down.
######################################################################

resource "google_redis_instance" "v2" {
  name           = var.instance_name
  project        = var.project_id
  region         = var.region
  tier           = var.tier
  memory_size_gb = var.memory_size_gb
  redis_version  = var.redis_version

  authorized_network = var.authorized_network
  connect_mode       = "PRIVATE_SERVICE_ACCESS"

  auth_enabled            = var.auth_enabled
  transit_encryption_mode = var.transit_encryption_mode

  lifecycle {
    prevent_destroy = true
    ignore_changes = [
      labels,
      maintenance_policy,
      redis_configs,
      reserved_ip_range,
      secondary_ip_range,
      replica_count,
      read_replicas_mode,
      persistence_config,
    ]
  }
}
