######################################################################
# HTTPS LB + Serverless NEG + Certificate Manager.
#
# Topology:
#   global_forwarding_rule (443)
#     └── target_https_proxy
#           ├── certificate_map  ── certificate_map_entry ── cert (DNS auth)
#           └── url_map
#                 └── backend_service
#                       └── serverless_NEG → the api service
#
# Cert uses Certificate Manager DNS authorization — issuance is fully
# pre-wired here; the user only has to publish ONE CNAME on your DNS provider
# (`_acme-challenge.<domain>` → <auth_value>) before the cert
# transitions to ACTIVE. GCE legacy stays live throughout because the
# The A record `<domain> → LB IP` is managed in your DNS provider.
######################################################################

######################################################################
# Anycast IPv4 — printed as output so user can later swap your DNS provider A
# record to it during DNS cutover.
######################################################################

resource "google_compute_global_address" "lb_ipv4" {
  project    = var.project_id
  name       = "${var.name_prefix}-lb-ipv4"
  ip_version = "IPV4"
}

######################################################################
# Serverless NEG → the api service Cloud Run service.
######################################################################

resource "google_compute_region_network_endpoint_group" "api" {
  project               = var.project_id
  region                = var.region
  name                  = "${var.name_prefix}-neg"
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = var.cloud_run_service_name
  }
}

######################################################################
# Backend service. CDN off (auth + user data — no caching).
# Logging on at full sample so we have request-level traces for
# debugging the LB→Cloud Run hop.
######################################################################

resource "google_compute_backend_service" "api" {
  project               = var.project_id
  name                  = "${var.name_prefix}-backend"
  protocol              = "HTTPS"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  enable_cdn            = false

  backend {
    group = google_compute_region_network_endpoint_group.api.id
  }

  log_config {
    enable      = true
    sample_rate = 1.0
  }
}

######################################################################
# URL map — single host, single backend; no path-based routing.
######################################################################

resource "google_compute_url_map" "api" {
  project         = var.project_id
  name            = "${var.name_prefix}-urlmap"
  default_service = google_compute_backend_service.api.id

  host_rule {
    hosts        = [var.domain]
    path_matcher = "api"
  }

  path_matcher {
    name            = "api"
    default_service = google_compute_backend_service.api.id
  }
}

######################################################################
# Certificate Manager — DNS authorization + managed cert.
# Output dns_resource_record drives the your DNS provider CNAME the user adds.
######################################################################

resource "google_certificate_manager_dns_authorization" "api" {
  project = var.project_id
  name    = "${var.name_prefix}-dns-auth"
  domain  = var.domain
}

resource "google_certificate_manager_certificate" "api" {
  project = var.project_id
  name    = "${var.name_prefix}-cert"
  scope   = "DEFAULT"

  managed {
    domains            = [var.domain]
    dns_authorizations = [google_certificate_manager_dns_authorization.api.id]
  }
}

resource "google_certificate_manager_certificate_map" "api" {
  project = var.project_id
  name    = "${var.name_prefix}-cert-map"
}

resource "google_certificate_manager_certificate_map_entry" "api" {
  project      = var.project_id
  name         = "${var.name_prefix}-cert-map-entry"
  map          = google_certificate_manager_certificate_map.api.name
  certificates = [google_certificate_manager_certificate.api.id]
  hostname     = var.domain
}

######################################################################
# HTTPS target proxy + global forwarding rule.
# certificate_map ref must be in the documented `//certificatemanager…`
# URI form; bare cert IDs are not accepted by the proxy.
######################################################################

resource "google_compute_target_https_proxy" "api" {
  project         = var.project_id
  name            = "${var.name_prefix}-https-proxy"
  url_map         = google_compute_url_map.api.id
  certificate_map = "//certificatemanager.googleapis.com/${google_certificate_manager_certificate_map.api.id}"
}

resource "google_compute_global_forwarding_rule" "api" {
  project               = var.project_id
  name                  = "${var.name_prefix}-https-fr"
  target                = google_compute_target_https_proxy.api.id
  port_range            = "443"
  ip_address            = google_compute_global_address.lb_ipv4.address
  load_balancing_scheme = "EXTERNAL_MANAGED"
}
