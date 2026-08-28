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

# Organisations as the commercial ownership boundary

## Context and Problem Statement

Address quality is bought and operated by teams. The direct channel must decide whether subscriptions, API keys, entitlement and usage belong to an individual person or to a shared customer organisation.

## Decision Drivers

- Let team membership change without transferring commercial records.
- Isolate one customer's keys, usage and billing from another's.
- Support one person belonging to multiple customers.
- Give one stable owner to every subscription and usage event.

## Considered Options

1. **Organisation-owned commercial state (chosen).**
2. **Individual-user ownership.**
3. **A mixture chosen per resource.**

## Decision Outcome

Chosen option: **"Organisation-owned commercial state."** One Addressr organisation maps to one Stripe Customer and owns its subscriptions, API-key namespace, entitlement and usage. People receive access through membership and may belong to multiple organisations without sharing commercial state between them.

## Consequences

### Good

- Staff changes do not require key or subscription transfer.
- Every commercial record has one ownership boundary.
- Cross-customer isolation is testable and explainable.

### Neutral

- Even a single-person customer has an organisation record.

### Bad

- Invitation, role and organisation-recovery policy becomes necessary.
- Merging or splitting customer organisations requires explicit operational handling.

## Confirmation

1. Every Stripe Customer, subscription, API key, entitlement and usage event references exactly one Addressr organisation.
2. Membership in one organisation grants no access to another organisation's records.
3. Removing a person does not delete or transfer organisation-owned resources.
4. One person can switch between multiple authorised organisations without sharing keys or usage.

## Pros and Cons of the Options

### Organisation ownership

- Good, because it matches the primary buyer and keeps ownership stable across staff changes.
- Bad, because every customer needs organisation lifecycle handling.

### Individual ownership

- Good, because initial signup is simpler.
- Bad, because team access and staff departure make ownership ambiguous.

### Mixed ownership

- Good, because each resource could choose its most convenient owner.
- Bad, because authorization and support would need resource-specific ownership rules.

## Reassessment Criteria

Reassess if the product develops a substantial individual-consumer use case or enterprise customers require multiple billing accounts inside one organisation.

## Related

- [ADR-066 — Clerk as the application identity provider](066-clerk-as-the-application-identity-provider.proposed.md)
- [ADR-070 — Organisation-scoped one-time-visible hashed API keys](070-organisation-scoped-one-time-visible-hashed-api-keys.proposed.md)
