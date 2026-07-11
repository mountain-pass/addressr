# `deploy/modules/opensearch`

AWS-managed OpenSearch domain provisioning for addressr.

See [ADR 030](../../../docs/decisions/030-opensearch-domain-terraform-module.proposed.md) for the decision rationale and [ADR 029](../../../docs/decisions/029-opensearch-blue-green-two-phase-upgrade.proposed.md) for the two-phase blue/green upgrade pattern that drives the first use of this module.

## Usage

```hcl
module "opensearch_v2" {
  source = "./modules/opensearch"

  name           = "addressr4"
  engine_version = "OpenSearch_2.19"
  instance_type  = "m6g.large.search"
  instance_count = 2
  ebs_volume_size = 20
  # ADR 033: FGAC is off — auth is IAM/SigV4, not a master user. Access is
  # scoped by principal ARN, not username/password.
  allowed_principal_arns = [/* EB instance role, loader identity, GHA OIDC role */]
  tags                   = { ManagedBy = "terraform", Component = "search" }
}
```

The `endpoint` output feeds `ELASTIC_HOST` in `deploy/main.tf` directly (`module.opensearch_v2.endpoint`).

## Audit logs (P036)

`enable_audit_logs` (default `true`) publishes OpenSearch `AUDIT_LOGS` to a per-domain CloudWatch log group (`/aws/opensearch/<name>/audit-logs`, retention `audit_log_retention_days`, default 90). FGAC internal-user changes — the P036 master-user password-clobber pattern — never surface in CloudTrail; audit logs are the only trace. The CloudWatch resource policy is account/region-scoped (AWS caps 10 per region) and named per domain.

## Scope

- **In scope**: the AWS-managed production domain.
- **Out of scope**: the **Self-Hosted Operator (J6)** persona — self-hosted users run their own OpenSearch via Docker and are unaffected by this module. The local/CI Docker image (`SEARCH_IMAGE` in `package.json`) is also outside this module's surface.
- **Out of scope (for now)**: VPC placement. See the note in `variables.tf`.

## Auth (ADR 033)

FGAC is **off** — the domain has no master user. Access is IAM/SigV4, gated by
the domain access policy (`allowed_principal_arns`): the EB instance role (app),
the local operator identity, and the GitHub Actions OIDC loader role (ADR 034).
The v1 basic-auth `var.elastic_username`/`_password`/`_host` and the v2
master-user vars were removed 2026-07-11 with the v1 decommission.
