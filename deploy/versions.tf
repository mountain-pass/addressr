terraform {
  backend "remote" {
    organization = "mountainpass"

    workspaces {
      prefix = "addressr-"
    }
  }
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
    google = {
      source = "hashicorp/google"
    }
    # ADR 032 / P042 — Cloudflare Worker brought under Terraform.
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
  required_version = ">= 0.13"
}
