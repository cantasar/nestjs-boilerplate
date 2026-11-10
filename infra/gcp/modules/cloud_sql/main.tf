######################################################################
# Cloud SQL Postgres instance.
#
# Private-IP instance. Operational tunables (ssl_mode, backups,
# flags, disk, maintenance) are in ignore_changes so out-of-band ops
# tuning does not fight Terraform; enable backups in the runbook.
######################################################################

resource "google_sql_database_instance" "this" {
  name                = var.instance_name
  project             = var.project_id
  region              = var.region
  database_version    = var.database_version
  deletion_protection = true

  settings {
    tier = var.tier

    ip_configuration {
      ipv4_enabled    = false
      private_network = var.vpc_self_link
    }
  }

  lifecycle {
    # Parity with the memorystore module: deletion_protection alone can be
    # flipped and destroyed in the same apply. prevent_destroy requires a
    # deliberate .tf edit to ever tear this down — defense in depth, not
    # redundant with deletion_protection.
    prevent_destroy = true
    ignore_changes = [
      settings[0].ip_configuration[0].ssl_mode,
      settings[0].ip_configuration[0].authorized_networks,
      settings[0].ip_configuration[0].allocated_ip_range,
      settings[0].ip_configuration[0].enable_private_path_for_google_cloud_services,
      settings[0].ip_configuration[0].psc_config,

      # Operational tunables managed out-of-band.
      settings[0].database_flags,
      settings[0].backup_configuration,
      settings[0].maintenance_window,
      settings[0].insights_config,
      settings[0].user_labels,
      settings[0].disk_size,
      settings[0].disk_autoresize,
      settings[0].disk_autoresize_limit,
      settings[0].disk_type,
      settings[0].pricing_plan,
      settings[0].activation_policy,
      settings[0].availability_type,
      settings[0].deletion_protection_enabled,
      settings[0].edition,
      settings[0].password_validation_policy,
      settings[0].enable_dataplex_integration,

      # Root cert + replica metadata change on rotation/replica events.
      root_password,
      encryption_key_name,
    ]
  }
}
