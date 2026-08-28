---
status: 'proposed'
date: 2026-08-28
human-oversight: unconfirmed
decision-makers: [Tom Howard]
consulted: [wr-architect:agent]
informed: []
reassessment-date: 2026-11-28
---

# Commercial request state stored in Cloudflare D1

## Context and Problem Statement

The gateway needs a durable local source for key hashes, entitlement snapshots, quota state and usage events. The store controls request correctness, latency, recovery and Terraform bindings, so it cannot remain an implicit implementation detail.

## Decision Drivers

- Run close to the Cloudflare Worker request path.
- Support authoritative conditional writes and idempotency constraints.
- Keep commercial state out of the search server.
- Remain version-controlled and provisioned with the existing Cloudflare infrastructure.

## Considered Options

1. **Cloudflare D1 (chosen).**
2. **Cloudflare KV.**
3. **A separately hosted relational database.**
4. **Defer the store choice.**

## Decision Outcome

Chosen option: **"Cloudflare D1."** D1 is the local system of record for API-key hashes, organisation linkage, entitlement snapshots, quota state and idempotent usage events used by the gateway.

The schema uses database constraints and conditional writes for uniqueness and quota transitions. If production-like concurrency testing cannot prove required hard-stop and idempotency semantics, implementation stops for a superseding storage decision; a second store is not added implicitly.

## Consequences

### Good

- The gateway reads commercial state without a cross-provider database dependency.
- Relational constraints provide an auditable consistency model.
- Terraform can provision the binding with the Worker.

### Neutral

- Identity and billing providers remain authoritative for their own domains; D1 holds request-time projections.

### Bad

- Direct-channel availability and latency now depend on D1.
- Schema migrations and reconciliation become permanent operational responsibilities.

## Confirmation

1. Terraform provisions the D1 database and binds it to the existing Worker.
2. D1 stores no API-key plaintext or provider secret.
3. Unique constraints reject duplicate organisation links, event identities and key hashes.
4. Concurrency tests prove the required quota transition and idempotent replay behaviour.
5. A missing D1 binding, or failure to read or write load-bearing state, fails closed and is operationally distinguishable.

## Pros and Cons of the Options

### D1

- Good, because it is relational and native to the Worker platform.
- Bad, because its consistency and latency must be proven under the real request pattern.

### KV

- Good, because reads are edge-oriented and simple.
- Bad, because eventual consistency is unsuitable for authoritative quotas and idempotency.

### Separate relational database

- Good, because it offers mature database features.
- Bad, because it adds network, credential and operating boundaries.

### Defer the choice

- Good, because it avoids premature commitment.
- Bad, because implementation correctness depends on the store semantics now.

## Reassessment Criteria

Reassess if D1 cannot prove required atomicity, its measured request-path cost breaches the accepted budget, or regulatory needs require a different data location.

## Related

- [ADR-062 — Hosted customer access enforced at the gateway](062-hosted-customer-access-enforced-at-the-gateway.proposed.md)
- [ADR-065 — Abuse throttling separated from commercial accounting](065-abuse-throttling-separated-from-commercial-accounting.proposed.md)
