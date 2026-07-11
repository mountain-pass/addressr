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
  description = "Data-node instance type. The v2 domain runs m6g.large.search (ADR 029 steady-state sizing for 2.19); override via caller if different."
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

# ADR 033: FGAC removed — no master user, no internal user DB. Auth is
# IAM/SigV4 gated by the access policy below. (The former master_user_* and
# audit-log variables were dropped with FGAC; AUDIT_LOGS requires FGAC.)

variable "allowed_principal_arns" {
  type        = list(string)
  nullable    = false
  description = "IAM principal ARNs allowed to call the domain (SigV4). ADR 033 non-negotiable: the sole access gate with FGAC off. Typically the EB instance role (app) + the loader identity. Never \"*\"."
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Resource tags applied to the domain."
}

# VPC/subnet placement intentionally omitted in this module version.
# The domain is public with IAM/SigV4 access control (ADR 033, FGAC off) rather
# than network isolation; a network-hardening change is out of scope for ADR 030.
# A future ADR can add vpc_options to this module without breaking callers.
