---
status: 'proposed'
date: 2026-08-28
human-oversight: confirmed
oversight-date: 2026-08-28
decision-makers: [Tom Howard]
consulted: [wr-architect:agent]
informed: []
reassessment-date: 2026-11-28
---

# Managed gateway D1 query envelope

## Context and Problem Statement

The managed request path reads entitlement and records authoritative usage in D1. It needs a database-work gate independent of Worker compute and customer-visible latency.

## Decision Drivers

- Keep request-time database work bounded and index-backed.
- Detect accidental scans or chatty queries before activation.
- Bound data returned to the Worker.
- Fail closed when authoritative state is unavailable.

## Considered Options

1. **Gate statement count, response bytes and query plans (proposed).**
2. **Rely on D1 provider limits.**
3. **Measure D1 work without an activation gate.**

## Decision Outcome

Proposed option: **"Gate statement count, response bytes and query plans."** Every managed request outcome, including invalid, revoked, exhausted and malformed credentials, may execute at most three D1 statements and receive at most 4 KiB of D1 response data. Every request-time lookup must use an indexed plan with no full table scan.

## Consequences

### Good

- Database work stays small and reviewable.
- Query-plan regressions block activation.
- Response data cannot grow silently with table size.

### Neutral

- Worker compute and customer-visible wall time are governed separately.

### Bad

- Schema changes can require new query-plan evidence.
- The three-statement ceiling constrains how entitlement and usage writes are composed.

## Confirmation

1. D1 metadata reports statements, rows read and written, and response bytes for the exercised path.
2. Per-outcome evidence proves accepted, invalid, revoked, exhausted and malformed requests use no more than three statements and receive no more than 4 KiB.
3. `EXPLAIN QUERY PLAN` shows indexed request-time searches and no full table scan.
4. Twice the confidential verified peak concurrency causes no D1 overload and no entitlement bypass.
5. Missing or overloaded state fails closed before origin forwarding or billable accounting.

## Pros and Cons of the Options

### Explicit D1 gate

- Good, because scans and query growth fail before production.
- Bad, because the ceiling must be revalidated as the schema changes.

### Provider hard limits

- Good, because no local query budget needs maintenance.
- Bad, because provider enforcement is already a customer-visible failure.

### Measurement only

- Good, because it records evidence without rejecting activation.
- Bad, because observed runaway database work can still launch.

## Reassessment Criteria

Reassess if the minimal indexed transaction cannot meet the statement ceiling, D1 observability changes, or production evidence shows the response bound is inappropriate.

## Related

- [ADR-062 — Hosted customer access enforced at the gateway](062-hosted-customer-access-enforced-at-the-gateway.proposed.md)
- [ADR-064 — Commercial request state stored in Cloudflare D1](064-commercial-request-state-stored-in-cloudflare-d1.proposed.md)
- [ADR-077 — Managed gateway added-latency budget](077-managed-gateway-added-latency-budget.proposed.md)
- [ADR-078 — Managed gateway Worker compute envelope](078-managed-gateway-worker-compute-envelope.proposed.md)
