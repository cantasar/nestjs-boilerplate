terraform {
  required_version = ">= 1.10.0"

  # Partial backend config. Bucket, key and region come at init time:
  #   terraform init \
  #     -backend-config="bucket=<your-project>-tfstate" \
  #     -backend-config="key=<env>/terraform.tfstate" \
  #     -backend-config="region=<region>"
  # use_lockfile = S3-native state locking (no DynamoDB table needed).
  backend "s3" {
    use_lockfile = true
    encrypt      = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = merge({ ManagedBy = "terraform", App = var.name }, var.tags)
  }
}
