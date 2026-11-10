output "lb_ipv4" {
  description = "Anycast IPv4 the domain A record should point to."
  value       = google_compute_global_address.lb_ipv4.address
}

output "cert_dns_auth_cname_host" {
  description = "DNS CNAME host to add (relative to apex). Typically '_acme-challenge.<domain>.'."
  value       = try(google_certificate_manager_dns_authorization.api.dns_resource_record[0].name, "")
}

output "cert_dns_auth_cname_type" {
  description = "CNAME record type (expected 'CNAME')."
  value       = try(google_certificate_manager_dns_authorization.api.dns_resource_record[0].type, "")
}

output "cert_dns_auth_cname_value" {
  description = "CNAME data — the value the your DNS provider record points to."
  value       = try(google_certificate_manager_dns_authorization.api.dns_resource_record[0].data, "")
}

output "cert_id" {
  value = google_certificate_manager_certificate.api.id
}

output "cert_name" {
  value = google_certificate_manager_certificate.api.name
}

output "neg_id" {
  value = google_compute_region_network_endpoint_group.api.id
}

output "backend_service_id" {
  value = google_compute_backend_service.api.id
}

output "url_map_id" {
  value = google_compute_url_map.api.id
}
