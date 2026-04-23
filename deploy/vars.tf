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
variable "elastic_v2_name" {
  type        = string
  nullable    = false
  default     = "search-addressr4"
  description = "ADR 029 Phase 1 / ADR 030: domain name for the v2 OpenSearch domain provisioned in parallel during blue/green cutover. Phase 2 can override to search-addressr5 (or similar) without touching main.tf."
}
variable "elastic_v2_engine_version" {
  type        = string
  nullable    = false
  default     = "OpenSearch_2.19"
  description = "ADR 029 Phase 1: engine version for the v2 domain. Phase 2 will override to OpenSearch_3.x."
}
