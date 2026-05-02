---
status: 'proposed'
date: 2026-04-21
decision-makers: [Tom Howard]
consulted: []
informed: []
reassessment-date: 2026-07-21
---

# ADR 030: Bring AWS OpenSearch domain under Terraform management

## Context and Problem Statement

addressr declares its production deployment via Terraform under `deploy/`: the Elastic Beanstalk application, S3 bucket, application versioning, and EB environment configuration are all under IaC per [ADR 004 (AWS Elastic Beanstalk deployment)](004-aws-elastic-beanstalk-deployment.accepted.md). The single notable exception is the **AWS-managed OpenSearch Service domain** (`search-addressr3-….aos.ap-southeast-2.on.aws`). It was provisioned out-of-band through the AWS console and exists only as a console artefact. Terraform sees the domain only as a free-form string variable (`var.elastic_host`) which is injected into the EB environment as `ELASTIC_HOST` at `deploy/main.tf:94-95`.

This is a standalone IaC-hygiene gap, independent of any specific upgrade plan: the configuration of the largest single line item in the AWS bill (per ADR 021) lives in console screenshots and operator memory rather than in version control. Drift between declared and actual configuration cannot be detected. Future provisioning patterns (e.g., the locality/postcode secondary indices flagged in ADR 021's direction; Phase 2 of the engine upgrade plan; any disaster-recovery rebuild) all require either a new manual provision or a retrofit. The longer the gap persists, the more "tribal knowledge" accretes around the un-IaC'd resource.

[ADR 029](029-opensearch-blue-green-two-phase-upgrade.proposed.md) is the **forcing function** that brings this work to the front of the queue: Phase 1 of the blue/green upgrade requires a second OpenSearch domain (`search-addressr4-…`), which is the natural moment to choose how OpenSearch domains are provisioned going forward. The IaC-hygiene case stands on its own — even if ADR 029 Phase 2 changes shape or a future ADR replaces the engine entirely, this decision continues to make sense.

## Decision Drivers

- **J7 (Ship releases reliably from trunk)** — declared-vs-actual drift on prod-critical infrastructure is a release-integrity failure mode. The whole point of ADR 004's IaC posture is to make releases reproducible and reviewable; an out-of-IaC search domain undermines that for the most expensive resource in the stack.
- Reproducibility — any future OpenSearch provisioning (Phase 2, secondary indices, DR rebuild) should be a Terraform invocation rather than a console session
- Reviewability — domain configuration (instance class, storage, access policy, network) should appear in pull requests, not console diffs
- Minimise blast radius on the running `search-addressr3-…` domain — do not put the live prod backend through a `terraform import` cycle that could alter or destroy it
- Consistency with the rest of `deploy/` (per ADR 004)
- Reuse the pattern across multiple OpenSearch domains (the upgrade story implies at least two; the multi-backend / locality-postcode direction implies more)

## Considered Options

1. **Leave the OpenSearch domain unmanaged forever** — provision `search-addressr4-…` manually in the AWS console, accept the gap permanently
2. **Import the existing `search-addressr3-…` into Terraform and provision `search-addressr4-…` in Terraform** — both domains managed from the same state from day one
3. **Leave `search-addressr3-…` unmanaged, provision `search-addressr4-…` as a flat `aws_opensearch_domain` resource in `deploy/main.tf`** — gradually IaC-fy as part of the upgrade
4. **Leave `search-addressr3-…` unmanaged, provision `search-addressr4-…` via a new `deploy/modules/opensearch/` Terraform module** — encapsulate the resource for reuse

## Decision Outcome

Chosen option: **Option 4 — create a new `deploy/modules/opensearch/` Terraform module, use it to provision `search-addressr4-…`, leave `search-addressr3-…` unmanaged until decommissioning at the end of [ADR 029](029-opensearch-blue-green-two-phase-upgrade.proposed.md) Phase 1 soak.**

Reasoning:

- **Option 1** is rejected because it institutionalises the gap that ADR 030 exists to close.
- **Option 2** has a real blast radius. A bad `terraform import` followed by a configuration-drifted `apply` could alter or destroy the running production domain. Given `search-addressr3-…` is decommissioned within weeks at the end of ADR 029 Phase 1 soak anyway, importing-then-destroying is net-negative work.
- **Option 3** correctly avoids the import blast radius but leaves the OpenSearch resource as a flat block in `deploy/main.tf`. ADR 029 Phase 2 (and any future OpenSearch provisioning) would then either copy-paste the block or refactor into a module — paying twice. Better to module-ify on first use.
- **Option 4** combines Option 3's safety (no `terraform import` against the live domain) with one-time module work that is reused by Phase 2 and any locality/postcode direction from ADR 021.

### Module shape

```
deploy/modules/opensearch/
  main.tf         # aws_opensearch_domain resource + IAM/access-policy attachments
  variables.tf    # name, engine_version, instance_type, instance_count, ebs_volume_size, master_user_*, vpc/subnet (if any), tags
  outputs.tf      # endpoint, arn, domain_name
  versions.tf     # terraform + aws provider version constraints (matches deploy/versions.tf)
```

The root `deploy/main.tf` calls the module once per domain. ADR 029 Phase 1 adds one call (`module "opensearch_v2"` for `search-addressr4-…` on engine 2.19). ADR 029 Phase 2 will add another call (`module "opensearch_v3"` on engine 3.x). Decommissioning is module-call removal + `terraform apply`.

### Scope

- **In scope**: AWS-managed production OpenSearch domain provisioned via the module. Credential wiring (admin user/password) follows the existing 1Password → GitHub Actions secrets → Terraform path used for `elastic_password` / `elastic_username` today (`deploy/vars.tf`).
- **Out of scope**: the **Self-Hosted Operator (J6)** persona. Self-hosted users run their own OpenSearch via Docker; this module governs the AWS-managed production deployment only. The local/CI Docker image (`SEARCH_IMAGE` in `package.json`) is unaffected by this ADR.
- **Out of scope**: importing `search-addressr3-…`. It remains unmanaged until end-of-Phase-1 decommissioning.

## Consequences

### Good

- Configuration of the new domain is code-reviewed before provisioning
- ADR 029 Phase 2 and any locality/postcode secondary index provisioning (per ADR 021's direction) reuse the module without rework
- Cutover rollback in ADR 029 stays in Terraform — flipping `var.elastic_host` is a single value change against a Terraform-managed dependency
- State drift between the two domains during the blue/green window cannot happen — they are state-tracked once both are provisioned
- Aligns the search tier with ADR 004's IaC posture for the rest of the deployment
- Serves **J7** by closing a known reproducibility gap

### Neutral

- `search-addressr3-…` remains unmanaged until it is destroyed at the end of ADR 029 Phase 1 soak. The asymmetry is explicit and time-bounded.
- Module shape is the conventional Terraform module layout; no architectural innovation, low maintenance burden
- **Distinct credentials per parallel domain (added 2026-04-29).** Each parallel domain instance (v1 active, v2 candidate; future v2 active, v3 candidate) carries its own master*user_name/password sourced from its own GHA secret + TFC workspace variable. The original ADR 029 step 4 design said "v2 reuses v1 creds for cutover simplicity" but in practice that aliasing collapses 4 storage locations (TFC v1, TFC v2, GHA v1, GHA v2) into a single `var.elastic_password` whose value can drift unobserved between TFC's stored value and EB's deployed env var. P028 was the first realised consequence: shadow silently 401'd every request for the entire ADR 031 soak window. Treat distinct creds per parallel domain as a deliberate property of the parallel-domain pattern, not an emergency fix during one cutover. Phase 2 (2.x → 3.x) will use `var.elastic_v3*\*` with the same shape.

### Bad

- One new Terraform module to maintain, plus the variable surface for OpenSearch domain configuration. Acceptable given the planned reuse frequency.
- Credential wiring (admin user/password for the new domain) requires extending the existing 1P → GH Actions → Terraform secret path. Concrete operational work on top of the module itself.
- Phase 1 of ADR 029 cannot start until this module has been **applied to real infra at least once** (module merge alone is insufficient). This is a real sequencing constraint that must be tracked in the implementation story.

## Confirmation

Mechanically checkable:

- `deploy/modules/opensearch/main.tf`, `variables.tf`, `outputs.tf`, and `versions.tf` exist before any production cutover under ADR 029.
- `deploy/main.tf` consumes the module via at least one `module "opensearch_..." {}` block referencing `./modules/opensearch`. Ad-hoc `aws_opensearch_domain` resources in `deploy/main.tf` (outside the module) constitute a confirmation violation.
- `terraform state list` (run against the workspace post-apply) includes `module.opensearch_v2.aws_opensearch_domain.*` for `search-addressr4-…`.
- `terraform plan` shows zero changes to `search-addressr3-…` throughout Phase 1 (the un-IaC'd domain must remain untouched by Terraform).
- `ELASTIC_HOST` in `deploy/main.tf` is sourced from a module output (`module.opensearch_v2.endpoint`) once the application is pointing at the new domain.

Narrative:

- The credential wiring path used for the new domain matches the project's existing 1Password → GitHub Actions secrets → Terraform pattern.

## Pros and Cons of the Options

### Option 1: Leave unmanaged

- Good: Zero new code
- Bad: Compounds the IaC-hygiene gap that ADR 030 exists to close
- Bad: Phase 2 of the upgrade repeats manual console work
- Bad: Future locality/postcode secondary indices repeat manual console work
- Bad: Configuration drift remains undetectable

### Option 2: Import existing + new in Terraform

- Good: Full IaC coverage from day one
- Bad: A bad `terraform import` followed by a drifted `apply` can alter or destroy the running prod domain — meaningful blast radius against production
- Bad: Net-negative work because the imported domain is decommissioned within weeks at the end of ADR 029 Phase 1 soak anyway
- Bad: Couples ADR 030 acceptance to a high-risk operation against live prod

### Option 3: Unmanaged old + new flat resource

- Good: Zero blast radius on the old domain
- Good: Faster to write than a module
- Neutral: Less reusable than a module
- Bad: ADR 029 Phase 2 will want a module anyway — pay twice
- Bad: Future locality/postcode work pays the same refactor cost

### Option 4: Unmanaged old + new via module (chosen)

- Good: All of Option 3's safety
- Good: Phase 2 and future provisioning reuse the module
- Good: Encapsulates variable surface for an OpenSearch domain in one place
- Neutral: Marginally more upfront scaffolding than Option 3
- Bad: Sequencing constraint — Phase 1 of ADR 029 depends on the module being applied at least once

## Reassessment Criteria

- End of ADR 029 Phase 1 soak → reassess whether to import any remaining unmanaged OpenSearch resource (in practice `search-addressr3-…` will be destroyed, so this is moot — but if for any reason it is kept around, that is the moment to import or formally accept the asymmetry).
- Module API surface fails to accommodate ADR 029 Phase 2 (3.x) requirements → revise the module before Phase 2 begins; do not branch the module per major version.
- Future ADR reopens the multi-backend direction (per ADR 021) and chooses a non-OpenSearch backend for some workload → the OpenSearch module remains valid for the workloads that stay on OpenSearch; no reassessment trigger.
- Before 2026-07-21, whichever comes first.

## Related

- [ADR 002 — OpenSearch as search engine](002-opensearch-as-search-engine.accepted.md) — engine choice; provisioning mechanism is orthogonal.
- [ADR 004 — AWS Elastic Beanstalk deployment](004-aws-elastic-beanstalk-deployment.accepted.md) — establishes the IaC posture this ADR extends to the search tier.
- [ADR 010 — DevContainer-based deployment in CI](010-devcontainer-ci-deployment.accepted.md) — the existing CI Terraform-via-devcontainer path absorbs the new module without changes.
- [ADR 021 — Retain OpenSearch, plan multi-backend](021-retain-opensearch-plan-multi-backend.proposed.md) — the locality/postcode direction is a future consumer of this module.
- [ADR 024 — Origin-gateway auth header enforcement](024-origin-gateway-auth-header-enforcement.accepted.md) — adjacent EB env-var concern; unaffected by this ADR.
- [ADR 029 — Two-phase blue/green upgrade off OpenSearch 1.3.20](029-opensearch-blue-green-two-phase-upgrade.proposed.md) — sibling ADR; the forcing function for this work but not its sole justification.
- [Problem P028 — OpenSearch 1.3.20 version debt](../problems/028-opensearch-1-3-20-version-debt.known-error.md) — context for why both ADRs exist now.
- [`docs/JOBS_TO_BE_DONE.md`](../JOBS_TO_BE_DONE.md) — J7 (maintainer release integrity); J6 (self-hosted) explicitly out of scope.
