terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.68"
    }
  }
}

# Credentials come from the environment (e.g. AWS_PROFILE=stockflow), never from these files.
provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "stockflow"
      ManagedBy = "terraform"
    }
  }
}
