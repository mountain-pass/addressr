variable "elasticapp" {
  type     = string
  nullable = false
  default  = "mountainpass-addressr"
}
variable "elasticapp_version" {
  type     = string
  nullable = false
}
variable "solution_stack_name" {
  type    = string
  default = "64bit Amazon Linux 2023 v6.5.2 running Node.js 22"
}
variable "tier" {
  type    = string
  default = "WebServer"
}
variable "aws_access_key" {
  type      = string
  sensitive = true
  nullable  = false
}
variable "aws_secret_key" {
  type      = string
  sensitive = true
  nullable  = false
}
variable "instance_type" {
  type    = string
  default = "t3.nano"
}
variable "minsize" {
  type    = number
  default = 2
}
variable "maxsize" {
  type    = number
  default = 4
}
variable "elastic_host" {
  type      = string
  sensitive = true
  nullable  = false
}
variable "elastic_password" {
  type      = string
  sensitive = true
  nullable  = false
}
variable "elastic_username" {
  type      = string
  sensitive = true
  nullable  = false
}
variable "proxy_auth_header" {
  type        = string
  sensitive   = true
  nullable    = false
  default     = ""
  description = "ADR 024: gateway auth header name (e.g. X-RapidAPI-Proxy-Secret). Empty = enforcement off. Pair-completeness is enforced by a precondition on aws_elastic_beanstalk_environment.beanstalkappenv."
}
variable "proxy_auth_value" {
  type        = string
  sensitive   = true
  nullable    = false
  default     = ""
  description = "ADR 024: gateway auth header expected value. Empty = enforcement off."
}
variable "elastic_v1_domain_name" {
  type        = string
  nullable    = false
  default     = "addressr3"
  description = "ADR 029 re-attempt 2026-07-06: DomainName dimension of the CURRENT production OpenSearch domain, used only for CloudWatch metric references on the parity dashboard. NOTE: the domain NAME is addressr3 — the search-addressr3-… string quoted in ADRs is the ENDPOINT prefix (AWS prepends search- to the domain name). Verified via aws opensearch list-domain-names 2026-07-07. The v1 domain resource itself stays out of Terraform scope per ADR 030 — metrics are referenced by name only."
}

variable "elastic_v2_name" {
  type        = string
  nullable    = false
  default     = "addressr4"
  description = "ADR 029 Phase 1 / ADR 030: domain name for the v2 OpenSearch domain provisioned in parallel during blue/green cutover. Re-attempt 2026-07-07: renamed search-addressr4 → addressr4 so the AWS endpoint (search-<name>-<hash>) reads search-addressr4-…, matching the ADR prose; attempt 1's literal search-addressr4 domain name produced a search-search-addressr4-… endpoint. The domain does not exist yet, so the rename is free. Operators: clear any stale elastic_v2_name override in the TFC workspace. Phase 2 can override to addressr5 without touching main.tf."
}
variable "elastic_v2_engine_version" {
  type        = string
  nullable    = false
  default     = "OpenSearch_2.19"
  description = "ADR 029 Phase 1: engine version for the v2 domain. Phase 2 will override to OpenSearch_3.x."
}
variable "elastic_v2_username" {
  type      = string
  sensitive = true
  nullable  = false
  description = "UNUSED as of ADR 033 (FGAC off, no master user). Deferred cleanup. Historically: v2 OpenSearch master user, GHA secret TF_VAR_ELASTIC_V2_USERNAME."
}
variable "loader_principal_arn" {
  type        = string
  nullable    = false
  default     = "arn:aws:iam::869772437473:user/tompahoward"
  description = "ADR 033: IAM principal that runs the loader locally (SigV4) and is granted access to the v2 domain. Since the data load moved off GitHub Actions to the local operator machine (GHA quota), this is the operator's IAM identity. Override if a different identity/role runs the load."
}

variable "v2_searchable_documents_floor" {
  type        = number
  default     = 1000000
  description = "ADR 033 / P035 trip-wire: alarm fires if v2 SearchableDocuments drops below this. Full dataset is ~16.8M; floor is set low enough to tolerate indexing/refresh jitter but catch a catastrophic wipe (the 2026-07-07 deletion went to 7). Raise toward ~15M once populate is complete and steady."
}

# ADR 033: elastic_v2_username/password are now UNUSED — FGAC is off, there is
# no master user. Kept declared (sourced from GHA secrets via release.yml) as
# deferred cleanup to avoid churning sync-tfc-vars.yml; harmless-but-orphaned.
variable "elastic_v2_password" {
  type      = string
  sensitive = true
  nullable  = false
  description = "UNUSED as of ADR 033 (FGAC off, no master password). Deferred cleanup. Historically: v2 OpenSearch master password, GHA secret TF_VAR_ELASTIC_V2_PASSWORD."
}

# ADR 032 / P042 — Cloudflare provider + worker module inputs.
variable "cloudflare_api_token" {
  type        = string
  sensitive   = true
  nullable    = false
  description = "Cloudflare API token with Workers Scripts Edit + Workers Routes Edit + Workers Secrets Edit scopes on the addressr account/zone. Sourced via 1P Voder → GHA secret TF_VAR_cloudflare_api_token (per reference_addressr_secrets)."
}

variable "cloudflare_account_id" {
  type        = string
  nullable    = false
  description = "Cloudflare account ID hosting the cool-bush-ca66 worker (Windy Road Cloudflare account, per ADR 018 line 30). Not strictly sensitive but sourced via the same GHA-secret path for consistency."
}

variable "cloudflare_zone_id" {
  type        = string
  nullable    = false
  description = "Cloudflare zone ID for the addressr.io zone. The api.addressr.io/* worker route binds against this zone."
}

variable "cloudflare_rapidapi_key" {
  type        = string
  sensitive   = true
  nullable    = false
  description = "RapidAPI key consumed by the worker (replaces the prior hardcoded value in the dashboard worker source, ADR 018 line 48 Bad consequence). Sourced via 1P Voder → GHA secret TF_VAR_cloudflare_rapidapi_key. The current production value is reused at cutover (no rotation during the P042 migration, per P042 ticket §16)."
}
