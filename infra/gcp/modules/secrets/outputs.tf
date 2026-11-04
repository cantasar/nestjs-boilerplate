output "secret_ids" {
  description = "Map of secret name -> secret_id (same value, indexed for consumption by Cloud Run module)."
  value       = { for k, v in google_secret_manager_secret.this : k => v.secret_id }
}

output "secret_names" {
  description = "List of created secret names."
  value       = [for s in google_secret_manager_secret.this : s.secret_id]
}
