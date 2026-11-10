output "job_name" {
  value = google_cloud_run_v2_job.migrate.name
}

output "job_id" {
  value = google_cloud_run_v2_job.migrate.id
}
