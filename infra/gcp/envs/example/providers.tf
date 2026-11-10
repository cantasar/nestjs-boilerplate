terraform {
  required_version = ">= 1.6.0"

  # Partial backend config — bucket + prefix are supplied at init time so the
  # state location is never hardcoded (keeps this reusable across projects):
  #   terraform init \
  #     -backend-config="bucket=<your-project>-tfstate" \
  #     -backend-config="prefix=<env>"
  backend "gcs" {}

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}
