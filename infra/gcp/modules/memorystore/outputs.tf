output "instance_name" {
  value = google_redis_instance.v2.name
}

output "host" {
  description = "Private IP of the v2 Redis instance."
  value       = google_redis_instance.v2.host
}

output "port" {
  description = "TLS port for the v2 Redis instance (6378 when transit_encryption_mode != DISABLED)."
  value       = google_redis_instance.v2.port
}

output "auth_string" {
  description = "AUTH string for the v2 instance. Use to compose rediss://default:<auth>@<host>:<port>/0."
  value       = google_redis_instance.v2.auth_string
  sensitive   = true
}

output "current_location_id" {
  value = google_redis_instance.v2.current_location_id
}
