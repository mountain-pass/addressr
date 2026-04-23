variable "name" {
  type        = string
  nullable    = false
  description = "Domain name, e.g. search-addressr4. No prefix is added by the module."
}

variable "engine_version" {
  type        = string
  nullable    = false
  description = "AWS OpenSearch Service engine version string, e.g. \"OpenSearch_2.19\"."
}

variable "instance_type" {
  type        = string
  default     = "t3.small.search"
  description = "Data-node instance type. Phase 1 (ADR 029) should match the existing search-addressr3-… class; override via caller if different."
}

variable "instance_count" {
  type        = number
  default     = 1
  description = "Data-node count. zone_awareness is enabled automatically when > 1."
}

variable "ebs_volume_size" {
  type        = number
  default     = 10
  description = "EBS volume size in GB per data node."
}

variable "ebs_volume_type" {
  type        = string
  default     = "gp3"
  description = "EBS volume type. gp3 is the current AWS default for new OpenSearch domains."
}

variable "master_user_name" {
  type        = string
  sensitive   = true
  nullable    = false
  description = "Fine-grained access control master user. Caller sources from 1Password → GitHub Actions secrets → Terraform (per ADR 030)."
}

variable "master_user_password" {
  type        = string
  sensitive   = true
  nullable    = false
  description = "Fine-grained access control master password. Caller sources from 1Password → GitHub Actions secrets → Terraform (per ADR 030)."
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Resource tags applied to the domain."
}

# VPC/subnet placement intentionally omitted in this module version.
# The existing search-addressr3-… domain is public with basic auth at the app layer,
# and a network-hardening change is out of scope for ADR 030. A future ADR can add
# vpc_options to this module without breaking callers.
