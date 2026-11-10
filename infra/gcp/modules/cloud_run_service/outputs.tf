locals {
  service = var.manage_template ? google_cloud_run_v2_service.managed[0] : google_cloud_run_v2_service.shell[0]
}

output "service_name" {
  value = local.service.name
}

output "uri" {
  value = local.service.uri
}

output "id" {
  value = local.service.id
}
