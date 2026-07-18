######################################################################
# Custom-mode VPC. ignore_changes tolerate attributes that drift from
# defaults or that an import copied from a live resource.
######################################################################

resource "google_compute_network" "this" {
  name                            = var.vpc_name
  project                         = var.project_id
  auto_create_subnetworks         = false
  routing_mode                    = "REGIONAL"
  delete_default_routes_on_create = false

  lifecycle {
    ignore_changes = [
      description,
      mtu,
      enable_ula_internal_ipv6,
      network_firewall_policy_enforcement_order,
    ]
  }
}

######################################################################
# Primary regional subnet.
######################################################################

resource "google_compute_subnetwork" "europe" {
  name          = var.subnet_name
  project       = var.project_id
  region        = var.region
  network       = google_compute_network.this.self_link
  ip_cidr_range = var.subnet_cidr

  lifecycle {
    ignore_changes = [
      description,
      private_ip_google_access,
      private_ipv6_google_access,
      purpose,
      role,
      stack_type,
      ipv6_access_type,
      log_config,
      secondary_ip_range,
    ]
  }
}

######################################################################
# PSA (Private Service Access) for managed services (Cloud SQL,
# Memorystore) private IP.
#
# Greenfield (create_psa_connection = true): allocate a peering range +
# create the servicenetworking connection so private-IP managed services
# attach to this VPC. Brownfield/import (false): the peering already
# exists (created implicitly when a managed service first got a private
# IP); only the route-export config is managed.
######################################################################

resource "google_compute_global_address" "psa_range" {
  count = var.create_psa_connection ? 1 : 0

  name          = var.psa_range_name
  project       = var.project_id
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = var.psa_prefix_length
  network       = google_compute_network.this.self_link
}

resource "google_service_networking_connection" "psa" {
  count = var.create_psa_connection ? 1 : 0

  network                 = google_compute_network.this.self_link
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.psa_range[0].name]
}

# K1 — flip route exchange flags so Direct VPC Egress peers reach the
# PSA-attached services. Depends on the connection when we create it.
resource "google_compute_network_peering_routes_config" "psa" {
  project              = var.project_id
  peering              = "servicenetworking-googleapis-com"
  network              = google_compute_network.this.name
  import_custom_routes = true
  export_custom_routes = true

  depends_on = [google_service_networking_connection.psa]
}

######################################################################
# Egress subnet for Direct VPC Egress. Cloud Run revisions get a NIC
# here (one private IP per active instance).
######################################################################

resource "google_compute_subnetwork" "egress" {
  name                     = var.egress_subnet_name
  project                  = var.project_id
  region                   = var.region
  network                  = google_compute_network.this.self_link
  ip_cidr_range            = var.egress_subnet_cidr
  private_ip_google_access = true
}

######################################################################
# Deny-all-egress baseline.
# Highest-numbered priority (lowest precedence) — every more-specific
# allow rule (priority < 65000) wins over this.
######################################################################

resource "google_compute_firewall" "deny_all_egress" {
  name      = var.deny_all_egress_firewall_name
  project   = var.project_id
  network   = google_compute_network.this.name
  direction = "EGRESS"
  priority  = 65000

  destination_ranges = ["0.0.0.0/0"]

  deny {
    protocol = "all"
  }
}

######################################################################
# Allow runtime SA → PSA range (Cloud SQL + Memorystore).
# EGRESS rules can only filter the source via target_service_accounts
# (or target_tags); source_ranges is not valid on EGRESS.
# 10.97.0.0/16 is the PSA-allocated range for managed services.
######################################################################

resource "google_compute_firewall" "allow_egress_psa" {
  name      = var.allow_egress_psa_firewall_name
  project   = var.project_id
  network   = google_compute_network.this.name
  direction = "EGRESS"
  priority  = 1000

  destination_ranges = [var.psa_destination_cidr]

  target_service_accounts = concat(
    [var.runtime_sa_email],
    var.extra_allow_egress_psa_sa_emails,
  )

  allow {
    protocol = "tcp"
    ports    = ["5432", "6378", "6379"]
  }
}
