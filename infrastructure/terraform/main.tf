# NyatiCare-Gateway — reference Terraform for a cloud deployment.
# This is a starting skeleton, not a turn-key production module.
# Fill in provider credentials via environment variables / a tfvars
# file that is NOT committed to git.

terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

resource "aws_ecr_repository" "auth_service" {
  name = "nyaticare/auth-service"
}

resource "aws_ecr_repository" "claims_ingestion" {
  name = "nyaticare/claims-ingestion"
}

resource "aws_ecr_repository" "patient_registry" {
  name = "nyaticare/patient-registry"
}

# NOTE: EKS cluster, RDS (Postgres), ElastiCache (Redis), and MSK (Kafka)
# resources go here as the project matures. Kept out of this skeleton
# to avoid provisioning real, billable infrastructure by accident.
