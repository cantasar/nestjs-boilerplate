output "runtime_sa_email" {
  description = "Email of the the service runtime SA."
  value       = google_service_account.runtime.email
}

output "runtime_sa_name" {
  description = "Fully-qualified resource name of the runtime SA (projects/.../serviceAccounts/...)."
  value       = google_service_account.runtime.name
}

output "runtime_sa_member" {
  description = "IAM member string for the runtime SA."
  value       = "serviceAccount:${google_service_account.runtime.email}"
}

output "cicd_sa_email" {
  description = "Email of the the service CI/CD SA."
  value       = google_service_account.cicd.email
}

output "cicd_sa_name" {
  description = "Fully-qualified resource name of the CI/CD SA."
  value       = google_service_account.cicd.name
}

output "cicd_sa_member" {
  description = "IAM member string for the CI/CD SA."
  value       = "serviceAccount:${google_service_account.cicd.email}"
}
