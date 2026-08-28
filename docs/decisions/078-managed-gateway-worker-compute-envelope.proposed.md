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

# Managed gateway Worker compute envelope

## Context and Problem Statement

Customer-visible latency can remain acceptable while Worker compute grows unexpectedly. The managed request path needs a separate local compute gate with isolate-aware memory wording.

## Decision Drivers

- Detect runaway authentication, entitlement or accounting compute before activation.
- Set a local operational envelope independently of provider hard limits.
- Measure memory at the shared-isolate boundary Cloudflare exposes.
- Keep the launch bound small enough to reveal accidental hot-path complexity.

## Considered Options

1. **Gate CPU and isolate memory with a local envelope (proposed).**
2. **Rely on provider hard limits.**
3. **Measure compute without an activation gate.**

## Decision Outcome

Proposed option: **"Gate CPU and isolate memory with a local envelope."** The managed request path must stay within 10 ms p95 Worker CPU, while p99 shared-isolate memory remains at or below 64 MiB under the representative concurrency test.

## Consequences

### Good

- Compute regressions are blocked before provider termination.
- Memory is measured at the actual shared-isolate boundary.
- The bound discourages request-time provider calls and unnecessary processing.

### Neutral

- D1 query work and customer-visible latency have separate budgets.

### Bad

- Memory cannot be attributed to a single accepted request.
- Runtime or concurrency changes require a fresh representative test.

## Confirmation

1. Worker evidence reports CPU and wall time for the exercised request path.
2. A representative concurrency test reports p99 isolate memory at or below 64 MiB.
3. The same test keeps p95 Worker CPU at or below 10 ms.
4. Twice the confidential verified peak concurrency causes no CPU or memory limit outcome and no entitlement bypass.
5. Missing compute evidence or an overload outcome blocks activation.
6. Authenticated production-plan and configured CPU-limit readback is recorded before activation; the local envelope does not claim unused provider headroom without it.

## Pros and Cons of the Options

### Explicit CPU and memory gate

- Good, because compute failures are caught before customers hit provider limits.
- Bad, because representative concurrency must be re-established as traffic changes.

### Provider hard limits

- Good, because no local threshold needs maintenance.
- Bad, because enforcement occurs as a customer-visible failure.

### Measurement only

- Good, because it records evidence without rejecting a build.
- Bad, because a known regression has no activation consequence.

## Reassessment Criteria

Reassess if Cloudflare changes runtime limits or observability, representative concurrency materially changes, or a minimal request path cannot meet a bound.

## Related

- [ADR-062 — Hosted customer access enforced at the gateway](062-hosted-customer-access-enforced-at-the-gateway.proposed.md)
- [ADR-077 — Managed gateway added-latency budget](077-managed-gateway-added-latency-budget.proposed.md)
- [ADR-080 — Managed gateway D1 query envelope](080-managed-gateway-d1-query-envelope.proposed.md)
