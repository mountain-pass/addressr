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
variable "loader_principal_arn" {
  type        = string
  nullable    = false
  default     = "arn:aws:iam::869772437473:user/tompahoward"
  description = "ADR 033: IAM principal that runs the loader locally (SigV4) and is granted access to the search domain. Since the data load moved off GitHub Actions to the local operator machine (GHA quota), this is the operator's IAM identity. Override if a different identity/role runs the load."
}


# ADR 032 / P042 — Cloudflare provider + worker module inputs.
variable "cloudflare_api_token" {
  type        = string
  sensitive   = true
  nullable    = false
  description = "Cloudflare API token with Workers Scripts Edit + Workers Routes Edit + Workers Secrets Edit + D1 Edit scopes on the addressr account/zone. Sourced via 1P Voder → GHA secret TF_VAR_cloudflare_api_token (per reference_addressr_secrets)."
}

variable "cloudflare_pages_api_token" {
  type        = string
  sensitive   = true
  nullable    = false
  description = "ADR-060: Cloudflare API token limited to Pages Write on the Addressr account and DNS Write on the addressr.io zone. It must not have Workers permissions."
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

variable "managed_origin_urls" {
  type        = list(string)
  sensitive   = true
  nullable    = false
  default     = []
  description = "ADR-073 direct origin base URLs, supplied confidentially by the production workspace. Empty keeps the customer branch fail-closed."
}

variable "managed_channel_enabled" {
  type        = bool
  nullable    = false
  default     = false
  description = "Explicit ADR-062 production activation switch. False keeps every customer-facing managed route closed even when provider configuration is present."
}

variable "managed_organization_allowlist" {
  type        = set(string)
  sensitive   = true
  nullable    = false
  default     = []
  description = "Named Clerk organisations eligible for restricted managed-channel verification. Empty denies all; this does not activate the channel."

  validation {
    condition = length(var.managed_organization_allowlist) <= 16 && alltrue([
      for id in var.managed_organization_allowlist : can(regex("^org_[A-Za-z0-9_]{1,124}$", id))
    ])
    error_message = "Allow at most 16 valid Clerk organisation identifiers."
  }
}

variable "managed_billable_statuses" {
  type        = set(number)
  sensitive   = true
  nullable    = false
  default     = []
  description = "ADR-072 origin HTTP statuses proved billable by confidential RapidAPI catalogue parity evidence. Empty keeps the customer branch fail-closed."
}

variable "clerk_publishable_key" {
  type        = string
  sensitive   = true
  nullable    = false
  default     = ""
  description = "ADR-066 Clerk publishable key. Empty keeps managed account journeys unavailable."
}

variable "clerk_jwt_key" {
  type        = string
  sensitive   = true
  nullable    = false
  default     = ""
  description = "ADR-066 Clerk PEM JWT public key used for networkless session verification."
}

variable "stripe_secret_key" {
  type        = string
  sensitive   = true
  nullable    = false
  default     = ""
  description = "ADR-068 Stripe secret key for Checkout, Customer Portal, projection and metering."
}

variable "stripe_plan_quotas" {
  type = map(object({
    quota     = number
    hardLimit = bool
  }))
  sensitive   = true
  nullable    = false
  default     = {}
  description = "ADR-072 confidential included-request allowances and explicit hard-limit policies. Zero included requests permits pay-per-use only with hardLimit=false. Empty keeps checkout unavailable."

  validation {
    condition = length(var.stripe_plan_quotas) == 0 || (
      length(var.stripe_plan_quotas) == 4 &&
      alltrue([for plan in ["basic", "pro", "ultra", "mega"] : contains(keys(var.stripe_plan_quotas), plan)]) &&
      alltrue([for policy in values(var.stripe_plan_quotas) : try(
        policy.quota >= 0 && policy.quota <= 9007199254740991 &&
        policy.quota == floor(policy.quota) && policy.hardLimit != null &&
        (!policy.hardLimit || policy.quota > 0), false
      )])
    )
    error_message = "Stripe plan policies must be empty or define safe whole-number allowances and explicit hardLimit booleans for exactly basic, pro, ultra and mega; hard limits require a positive allowance."
  }
}

variable "stripe_payment_method_types" {
  type        = list(string)
  sensitive   = true
  nullable    = false
  default     = []
  description = "ADR-082 explicitly verified immediate-outcome Stripe payment-method allowlist."
}

variable "stripe_catalogue_terms" {
  type = map(object({
    currency            = string
    unit_amount_decimal = optional(string)
    tiers = optional(list(object({
      up_to               = string
      flat_amount_decimal = optional(string)
      unit_amount_decimal = optional(string)
    })))
  }))
  sensitive   = true
  nullable    = false
  description = "ADR-085 confidential public-plan price terms supplied by the release pipeline."

  validation {
    condition = length(var.stripe_catalogue_terms) == 4 && alltrue([
      for plan in ["basic", "pro", "ultra", "mega"] : contains(keys(var.stripe_catalogue_terms), plan)
    ])
    error_message = "Stripe catalogue terms must define exactly basic, pro, ultra and mega."
  }

  validation {
    condition = alltrue([
      for terms in values(var.stripe_catalogue_terms) : can(regex("^[a-z]{3}$", terms.currency))
    ])
    error_message = "Every Stripe catalogue currency must be a lowercase three-letter code."
  }

  validation {
    condition = alltrue([
      for plan in ["basic", "pro"] :
      can(regex("^[0-9]+(?:\\.[0-9]+)?$", var.stripe_catalogue_terms[plan].unit_amount_decimal)) &&
      var.stripe_catalogue_terms[plan].tiers == null
    ])
    error_message = "Basic and pro must each define one non-negative decimal unit amount and no tiers."
  }

  validation {
    condition = alltrue([
      for plan in ["ultra", "mega"] :
      var.stripe_catalogue_terms[plan].unit_amount_decimal == null &&
      length(var.stripe_catalogue_terms[plan].tiers) == 2 &&
      var.stripe_catalogue_terms[plan].tiers[0].up_to != "inf" &&
      var.stripe_catalogue_terms[plan].tiers[1].up_to == "inf" &&
      can(regex("^[0-9]+(?:\\.[0-9]+)?$", var.stripe_catalogue_terms[plan].tiers[0].flat_amount_decimal)) &&
      can(regex("^[0-9]+(?:\\.[0-9]+)?$", var.stripe_catalogue_terms[plan].tiers[0].unit_amount_decimal)) &&
      can(regex("^[0-9]+(?:\\.[0-9]+)?$", var.stripe_catalogue_terms[plan].tiers[1].unit_amount_decimal))
    ])
    error_message = "Ultra and mega must each define two graduated tiers ending at inf, with non-negative decimal amounts."
  }
}

variable "managed_app_url" {
  type        = string
  nullable    = false
  default     = "https://app.addressr.io"
  description = "ADR-061 stable account and billing origin used for Stripe return URLs."
}

variable "customer_rate_limit_namespace_id" {
  type        = string
  nullable    = false
  default     = "1001"
  description = "Positive integer namespace for the managed-channel Cloudflare rate-limit binding."
}

variable "customer_rate_limit" {
  type        = number
  nullable    = false
  default     = 600
  description = "Per-source, per-Cloudflare-location managed-channel abuse ceiling each minute. D1 remains authoritative for quota."
}

variable "demo_rate_limit_namespace_id" {
  type        = string
  nullable    = false
  default     = "1002"
  description = "ADR-074 namespace for website-demo throttling, isolated from customer accounting and monitoring."
}

variable "demo_rate_limit" {
  type        = number
  nullable    = false
  default     = 120
  description = "Per-source website-demo request ceiling each minute."
}

variable "monitor_rate_limit_namespace_id" {
  type        = string
  nullable    = false
  default     = "1003"
  description = "ADR-074 namespace for monitoring throttling, isolated from customer accounting and website demos."
}

variable "monitor_rate_limit" {
  type        = number
  nullable    = false
  default     = 30
  description = "Per-source monitoring request ceiling each minute."
}

variable "elastic_v4_name" {
  type        = string
  nullable    = false
  default     = "addressr6"
  description = "ADR 041 / P069: domain name for the generation-4 domain, provisioned in parallel to carry the equivalent-synonym analyzer change. Generation N maps to domain addressr(N+2), so generation 4 is addressr6. Endpoint reads search-addressr6-…."
}

variable "elastic_v4_engine_version" {
  type        = string
  nullable    = false
  default     = "OpenSearch_3.5"
  description = "ADR 041: engine version for the generation-4 domain. Matches the engine version the v3 domain ran, so the ADR-041 cutover changed the analyzer only, never the engine. v3 was decommissioned 2026-08-02."
}

variable "v4_searchable_documents_floor" {
  type        = number
  default     = 15000000
  description = "ADR 041 / P035 trip-wire: absolute floor for the generation-4 SearchableDocuments alarm. Held at 1M during provision and bulk load so a fresh empty domain clears once the load crosses ~1M, mirroring what v3's floor did pre-cutover; raised to 15M at the ADR-041 cutover. NOTE the playbook asks for a floor near the expected count rather than a low 1M — an absolute floor cannot do both jobs during a load that legitimately starts at zero, so partial-drop detection is carried by the separate metric-math rate alarm instead. See the alarm comments in main.tf."
}


variable "ops_alert_email" {
  type        = string
  nullable    = false
  default     = "tompahoward@gmail.com"
  description = "ADR 041: subscriber for the search-ops SNS topic that carries the SearchableDocuments trip-wire alarms. Before this, the alarms changed state in the console and reached nobody, which meant 'armed' did not mean what ADR 035 and the playbook assumed it meant."
}
