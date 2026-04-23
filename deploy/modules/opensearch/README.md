# `deploy/modules/opensearch`

AWS-managed OpenSearch domain provisioning for addressr.

See [ADR 030](../../../docs/decisions/030-opensearch-domain-terraform-module.proposed.md) for the decision rationale and [ADR 029](../../../docs/decisions/029-opensearch-blue-green-two-phase-upgrade.proposed.md) for the two-phase blue/green upgrade pattern that drives the first use of this module.

## Usage

```hcl
module "opensearch_v2" {
  source = "./modules/opensearch"

  name                 = "search-addressr4"
  engine_version       = "OpenSearch_2.19"
  instance_type        = "t3.small.search"
  instance_count       = 1
  ebs_volume_size      = 10
  master_user_name     = var.elastic_username
  master_user_password = var.elastic_password
  tags                 = { ManagedBy = "terraform", Component = "search" }
}
```

The `endpoint` output feeds `var.elastic_host` / `ELASTIC_HOST` in `deploy/main.tf`.

## Scope

- **In scope**: the AWS-managed production domain.
- **Out of scope**: the **Self-Hosted Operator (J6)** persona — self-hosted users run their own OpenSearch via Docker and are unaffected by this module. The local/CI Docker image (`SEARCH_IMAGE` in `package.json`) is also outside this module's surface.
- **Out of scope (for now)**: VPC placement. See the note in `variables.tf`.

## Credential path

`master_user_name` / `master_user_password` follow the existing 1Password → GitHub Actions secrets → Terraform path used for `var.elastic_username` / `var.elastic_password` today (see `deploy/vars.tf` and memory `reference_addressr_secrets.md`).
