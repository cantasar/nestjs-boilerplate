output "runtime_sa_email" {
  value = module.iam.runtime_sa_email
}

output "cicd_sa_email" {
  value = module.iam.cicd_sa_email
}

output "vpc_self_link" {
  value = one(module.network[*].vpc_self_link)
}

output "egress_subnet_self_link" {
  value = one(module.network[*].egress_subnet_self_link)
}

output "cloud_sql_connection_name" {
  value = one(module.cloud_sql[*].connection_name)
}

output "cloud_sql_private_ip" {
  value = one(module.cloud_sql[*].private_ip)
}

output "memorystore_host" {
  value = one(module.memorystore[*].host)
}

output "memorystore_port" {
  value = one(module.memorystore[*].port)
}

output "api_service_uri" {
  value = module.cloud_run_api.uri
}

output "artifact_registry_repo" {
  value = module.artifact_registry.repository_id
}
