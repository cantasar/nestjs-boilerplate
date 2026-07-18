variable "project_id" {
  type = string
}

variable "region" {
  type        = string
  description = "Region for user-managed secret replication."
}

variable "runtime_sa_email" {
  description = "Runtime SA email — gets secretAccessor on each managed secret."
  type        = string
}

variable "secret_names" {
  description = "Secret Manager secret ids to manage (metadata + runtime accessor IAM). Values populated out-of-band."
  type        = list(string)
}
