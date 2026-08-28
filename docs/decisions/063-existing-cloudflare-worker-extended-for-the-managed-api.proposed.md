---
status: 'proposed'
date: 2026-08-28
human-oversight: unconfirmed
decision-makers: [Tom Howard]
consulted: [wr-architect:agent]
informed: []
reassessment-date: 2026-11-28
---

# Existing Cloudflare Worker extended for the managed API

## Context and Problem Statement

ADR-018 established a Cloudflare Worker for the website demo and monitoring path, and ADR-032 put it under Terraform control. The Addressr-managed channel needs a gateway implementation. Addressr must choose whether to extend that deployed edge or add a second gateway stack.

## Decision Drivers

- Reuse a working, version-controlled edge deployment.
- Avoid duplicate routes, secrets, monitoring and release machinery.
- Preserve the existing website demo and monitoring behaviour.
- Keep Terraform authoritative for the Worker.

## Considered Options

1. **Extend the existing Cloudflare Worker (chosen).**
2. **Create a second Cloudflare Worker and route.**
3. **Adopt a different gateway product.**

## Decision Outcome

Chosen option: **"Extend the existing Cloudflare Worker."**

The Worker gains an Addressr-managed customer path alongside its existing demo and monitoring paths. Routing and principal-isolation choices are made separately so this decision covers only reuse of the deployed Worker.

ADR-018 remains in force for demo-proxy behaviour. ADR-032 remains in force for Terraform deployment. This decision supersedes neither.

## Consequences

### Good

- One deployed edge, route and Terraform path serve all Addressr-operated gateway traffic.
- Existing demo and monitoring behaviour can be preserved during incremental delivery.
- A rollback can restore the previous Worker version without replacing DNS.

### Neutral

- Request routing and principal isolation remain separate decisions.

### Bad

- A Worker defect can affect multiple Addressr-operated request paths.
- Shared deployment reduces failure-domain isolation.

## Confirmation

1. Terraform plan updates the existing Worker and route in place and creates no parallel unmanaged gateway.
2. Existing demo and monitoring probes retain their documented behaviour.
3. A rollback to the preceding Worker artefact restores the previous demo and monitoring behaviour.

## Pros and Cons of the Options

### Extend the existing Worker

- Good, because it reuses a working deployment and secret spine.
- Bad, because one artefact carries more than one request path.

### Create a second Worker

- Good, because customer traffic would have an isolated failure domain.
- Bad, because it duplicates infrastructure before isolation has demonstrated value.

### Different gateway product

- Good, because a managed gateway might provide more commercial features.
- Bad, because it adds a second infrastructure and release model.

## Reassessment Criteria

Reassess if shared deployment causes two cross-principal incidents, the customer path needs Worker features unavailable through Terraform, or independent scaling and rollback become necessary.

## Related

- [ADR-018 — Cloudflare Worker as API Key Proxy](018-cloudflare-worker-api-proxy.accepted.md)
- [ADR-024 — Origin Gateway Auth Header Enforcement](024-origin-gateway-auth-header-enforcement.accepted.md)
- [ADR-032 — Cloudflare Worker deployed via Terraform](032-cloudflare-worker-terraform-deploy.proposed.md)
- [ADR-062 — Hosted customer access enforced at the gateway](062-hosted-customer-access-enforced-at-the-gateway.proposed.md)
- [ADR-073 — Managed gateway routes directly to the origins](073-managed-gateway-routes-directly-to-the-origins.proposed.md)
- [ADR-074 — Customer, demo and monitoring use distinct principals](074-customer-demo-and-monitoring-use-distinct-principals.proposed.md)
