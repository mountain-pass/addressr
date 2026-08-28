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

# Managed gateway added-latency budget

## Context and Problem Statement

ADR-062 blocks production activation until commercial enforcement has a numeric customer-visible performance budget. A relative-only comparison could accept a large absolute regression, while origin latency still needs to satisfy JTBD-001's 200 ms outcome.

## Decision Drivers

- Bound the latency customers pay for Addressr-managed authentication and entitlement.
- Preserve the existing autocomplete latency outcome.
- Compare equivalent requests rather than unrelated time windows.
- Make a failing region block activation rather than disappear in a global average.

## Considered Options

1. **At most 25 ms p95 and 50 ms p99 added latency (proposed).**
2. **At most 50 ms p95 and 100 ms p99 added latency.**
3. **Use a baseline-relative budget only.**
4. **Do not activate the managed channel until a budget can be chosen.**

## Decision Outcome

Proposed option: **"At most 25 ms p95 and 50 ms p99 added latency."** On a paired Australian/Oceania request path, managed commercial enforcement must add no more than 25 ms at p95 and 50 ms at p99. Total search p95 must also remain within JTBD-001's 200 ms outcome.

## Consequences

### Good

- Customers get an absolute bound on gateway overhead.
- A fast gateway cannot excuse a slow end-to-end search path.
- Paired measurement reduces unrelated traffic and origin noise.

### Neutral

- The budget is a launch bound, not a claim that every individual request completes within it.

### Bad

- A 200 ms total p95 gate may expose an existing origin breach unrelated to the new gateway.
- Multi-region evidence costs more than a single synthetic check.

## Confirmation

1. A paired A/B benchmark sends identical valid requests with commercial enforcement off and on.
2. The benchmark uses warm runs, multiple replicates and valid non-empty search responses.
3. Evidence records p50, p95, p99, sample size, region, Worker version and D1 location.
4. Both the added-latency budget and total 200 ms p95 gate pass before activation.
5. No averaging across regions can hide a failing measured region.

## Pros and Cons of the Options

### 25 ms p95 and 50 ms p99

- Good, because it leaves most of the customer outcome for search rather than commercial plumbing.
- Bad, because D1 placement or extra request-path work may make the bound difficult.

### 50 ms p95 and 100 ms p99

- Good, because it gives the gateway more operational headroom.
- Bad, because commercial plumbing could consume half the total outcome at p99.

### Relative-only budget

- Good, because it adapts to changing baselines.
- Bad, because a slow baseline can legitimize an unacceptable absolute result.

### Do not activate yet

- Good, because no unevidenced performance promise is made.
- Bad, because the managed channel cannot launch.

## Reassessment Criteria

Reassess after production evidence shows the bound is either routinely exceeded despite a minimal indexed path or so loose that regressions pass unnoticed.

## Related

- [JTBD-001 — Search and autocomplete addresses from partial input](../jtbd/web-app-developer/JTBD-001-search-autocomplete-addresses.validated.md)
- [ADR-062 — Hosted customer access enforced at the gateway](062-hosted-customer-access-enforced-at-the-gateway.proposed.md)
- [ADR-078 — Managed gateway Worker compute envelope](078-managed-gateway-worker-compute-envelope.proposed.md)
- [ADR-080 — Managed gateway D1 query envelope](080-managed-gateway-d1-query-envelope.proposed.md)
