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

# Stripe collection pausing prohibited for managed subscriptions

## Context and Problem Statement

Stripe can pause invoice collection without changing a subscription's status. A status-only entitlement projection could therefore leave access open while collection is suspended.

## Decision Drivers

- Keep the launch entitlement rule deterministic.
- Avoid a hidden collection state that bypasses ADR-075.
- Minimize money-path states in the first managed-channel slice.
- Fail closed on unsupported provider configuration.

## Considered Options

1. **Prohibit collection pausing at launch (proposed).**
2. **Treat any paused collection as access-denied.**
3. **Support each Stripe pause behaviour as a distinct entitlement policy.**

## Decision Outcome

Proposed option: **"Prohibit collection pausing at launch."** Managed-channel code and operations must not set `pause_collection`. If a managed subscription is observed with collection paused, entitlement fails closed and an operational alert is raised until the unsupported state is removed or separately governed.

## Consequences

### Good

- ADR-075 remains a small status mapping.
- Unsupported pause state cannot grant access silently.
- Launch avoids several extra billing-policy branches.

### Neutral

- Customer-requested payment pauses are not a launch capability.

### Bad

- Operations cannot use collection pausing as an ad hoc support tool.
- An accidental provider change interrupts access until corrected.

## Confirmation

1. Managed code exposes no action that sets `pause_collection`.
2. Authenticated readback shows no managed subscription with collection paused before activation.
3. A projected paused-collection condition denies access before origin forwarding or usage accounting.
4. The unsupported condition raises an alert without logging customer secrets.
5. Removing the pause restores status-based evaluation idempotently.

## Pros and Cons of the Options

### Prohibit pausing

- Good, because launch entitlement remains simple and deterministic.
- Bad, because payment pauses are unavailable.

### Deny whenever paused

- Good, because Stripe pausing can be offered with a simple access result.
- Bad, because it still introduces and supports an additional product state.

### Support every pause behaviour

- Good, because operations get maximum flexibility.
- Bad, because launch gains multiple collection and entitlement branches without evidenced need.

## Reassessment Criteria

Reassess when a real customer or support workflow requires payment pausing.

## Related

- [ADR-069 — Stripe state projected through signed webhooks](069-stripe-state-projected-through-signed-webhooks.proposed.md)
- [ADR-075 — Past-due access follows Stripe recovery](075-past-due-access-follows-stripe-recovery.proposed.md)
