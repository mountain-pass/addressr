variable "account_id" {
  type        = string
  nullable    = false
  description = "Cloudflare account ID hosting the worker. Sourced from var.cloudflare_account_id at the root (1P Voder → GHA secret TF_VAR_cloudflare_account_id)."
}

variable "zone_id" {
  type        = string
  nullable    = false
  description = "Cloudflare zone ID for the addressr.io zone (the api.addressr.io route binds against this zone)."
}

variable "script_name" {
  type        = string
  default     = "cool-bush-ca66"
  description = "Worker script name. Matches the existing dashboard worker name so `terraform import` lands without renaming. Per ADR 018 line 30."
}

variable "rapidapi_key" {
  type        = string
  sensitive   = true
  nullable    = false
  description = "RapidAPI key injected by the worker as the x-rapidapi-key header. Sourced from var.cloudflare_rapidapi_key at the root (1P Voder → GHA secret TF_VAR_cloudflare_rapidapi_key). Replaces the prior hardcoded value in the dashboard worker source (ADR 018 line 48 Bad consequence)."
}

variable "worker_dir" {
  type        = string
  default     = "../../cloudflare-worker"
  description = "Directory (relative to this module) containing worker.js, ip-matcher.mjs, and safe-ips.mjs."
}

variable "route_pattern" {
  type        = string
  default     = "api.addressr.io/*"
  description = "Cloudflare Worker route pattern. Bound against var.zone_id. The workers.dev fallback URL is auto-provisioned by the script resource — no separate route is needed for it (ADR 018 line 32)."
}

variable "compatibility_date" {
  type        = string
  default     = "2024-01-01"
  description = "Cloudflare Workers runtime compatibility date. Conservative pinning; recent enough for ES modules + fetch but stable. Bump in a dedicated PR if the worker starts to need a newer runtime feature."
}

variable "worker_bundle" {
  type        = string
  default     = "worker.bundled.js"
  description = "Filename (within worker_dir) of the esbuild bundle deployed as the worker content. Produced by `npm run build:worker` before terraform runs (deploy/deploy.sh). Gitignored deploy-time artifact — derived from worker.js + ip-matcher.mjs + safe-ips.mjs. ADR 032 amended 2026-05-25 (v5 single-content constraint)."
}

variable "main_module" {
  type        = string
  default     = "worker.js"
  description = "Logical entry-module name for the module-format worker. Labels the uploaded content part; does not need to be a real file (the deployed content is the bundle). Kept as worker.js for readability."
}
