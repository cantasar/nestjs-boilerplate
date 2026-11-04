output "vpc_self_link" {
  value = google_compute_network.this.self_link
}

output "vpc_name" {
  value = google_compute_network.this.name
}

output "vpc_id" {
  value = google_compute_network.this.id
}

output "subnet_self_link" {
  value = google_compute_subnetwork.europe.self_link
}

output "subnet_name" {
  value = google_compute_subnetwork.europe.name
}

output "egress_subnet_self_link" {
  value = google_compute_subnetwork.egress.self_link
}

output "egress_subnet_name" {
  value = google_compute_subnetwork.egress.name
}

# Cloud Run v2 network_interfaces.subnetwork requires the relative
# `projects/.../regions/.../subnetworks/<name>` form, NOT the
# `https://www.googleapis.com/...` self_link. Use this output for that.
output "egress_subnet_id" {
  value = google_compute_subnetwork.egress.id
}
