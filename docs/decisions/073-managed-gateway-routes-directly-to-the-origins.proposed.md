---
status: 'proposed'
date: 2026-08-28
human-oversight: unconfirmed
decision-makers: [Tom Howard]
consulted: [wr-architect:agent]
informed: []
reassessment-date: 2026-11-28
---

# Managed gateway routes directly to the origins

## Context and Problem Statement

The Addressr-managed customer path can reach the search origins directly under ADR-024 or add RapidAPI as an intermediary. That routing choice is independent of which Worker hosts the path.

## Decision Drivers

- Keep the two commercial channels operationally independent.
- Avoid paying or depending on a second gateway for Addressr-managed traffic.
- Preserve the existing two-origin topology and ADR-024 boundary.
- Keep RapidAPI subscriber traffic unchanged.

## Considered Options

1. **Route directly to the existing origins (chosen).**
2. **Route the managed channel through RapidAPI.**
3. **Create separate origins for the managed channel.**

## Decision Outcome

Chosen option: **"Route directly to the existing origins."** The managed gateway forwards entitled customer requests to both existing origins under ADR-024. RapidAPI continues reaching those origins independently for its subscribers.

## Consequences

### Good

- Each sales channel has an independent gateway path.
- The managed channel adds no RapidAPI hop or dependency.
- Existing origin redundancy is reused.

### Neutral

- Both gateways share the ADR-024 origin-secret contract.

### Bad

- Addressr owns routing health and failover for managed traffic.
- Shared origins remain a common failure domain.

## Confirmation

1. A valid managed-channel request reaches both configured origins directly under ADR-024.
2. No managed-channel request requires a RapidAPI credential or hop.
3. RapidAPI traffic and subscriber credentials continue unchanged.
4. Missing origin configuration fails closed with a distinguishable operational error.

## Pros and Cons of the Options

### Direct origin routing

- Good, because it keeps channel delivery independent.
- Bad, because Addressr owns the routing path.

### Route through RapidAPI

- Good, because it reuses RapidAPI routing.
- Bad, because the managed channel would still depend on the marketplace gateway.

### Separate origins

- Good, because it isolates origin capacity.
- Bad, because it duplicates infrastructure before evidence requires it.

## Reassessment Criteria

Reassess if shared origins cause channel contention, ADR-024 cannot support both gateways safely, or independent origin scaling becomes necessary.

## Related

- [ADR-024 — Origin Gateway Auth Header Enforcement](024-origin-gateway-auth-header-enforcement.accepted.md)
- [ADR-061 — RapidAPI and Addressr-managed dual distribution](061-rapidapi-and-addressr-managed-dual-distribution.proposed.md)
- [ADR-062 — Hosted customer access enforced at the gateway](062-hosted-customer-access-enforced-at-the-gateway.proposed.md)
- [ADR-063 — Existing Cloudflare Worker extended for the managed API](063-existing-cloudflare-worker-extended-for-the-managed-api.proposed.md)
