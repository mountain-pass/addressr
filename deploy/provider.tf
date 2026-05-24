provider "aws" {
  region     = "ap-southeast-2"
  access_key = var.aws_access_key
  secret_key = var.aws_secret_key
}

# ADR 032 / P042 — Cloudflare provider for the API key proxy worker described
# in ADR 018. API token scoped to Workers Scripts Edit + Workers Routes Edit +
# Workers Secrets Edit on the addressr account/zone. Sourced via 1P Voder →
# GHA secret TF_VAR_cloudflare_api_token (per reference_addressr_secrets).
provider "cloudflare" {
  api_token = var.cloudflare_api_token
}
