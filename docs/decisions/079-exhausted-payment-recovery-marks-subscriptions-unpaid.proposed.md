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

# Exhausted payment recovery marks subscriptions unpaid

## Context and Problem Statement

ADR-075 allows access during `past_due`. Exhausted recovery therefore needs a deterministic recovery-exhausted state rather than remaining `past_due` indefinitely.

## Decision Drivers

- End managed access when payment recovery is exhausted.
- Preserve a recoverable customer subscription where possible.
- Avoid indefinite unpaid access.
- Make the recovery-exhausted setting independently auditable.

## Considered Options

1. **Mark the subscription `unpaid` (proposed).**
2. **Cancel the subscription.**
3. **Leave the subscription `past_due` indefinitely.**

## Decision Outcome

Proposed option: **"Mark the subscription `unpaid`."** When Stripe exhausts its configured payment recovery, it moves the subscription to the recoverable `unpaid` state. ADR-075 denies managed API access without automatically canceling the customer relationship.

## Consequences

### Good

- Exhausted recovery always ends access.
- The subscription is not destroyed merely because retries failed.
- The recovery-exhausted policy remains independent of retry timing.

### Neutral

- Returning from `unpaid` requires the supported Stripe recovery journey.

### Bad

- Provider configuration drift could leave a subscription `past_due` indefinitely.
- Operations must verify restoration from `unpaid` before launch.

## Confirmation

1. Authenticated settings readback proves the `unpaid` recovery-exhausted action before activation.
2. Signed-webhook behavioural tests exercise duplicate, reordered and recovery-exhausted events through `unpaid`.
3. After authenticated proof of support for the exact enabled configuration, a Stripe sandbox or Test Clock exercise reaches `unpaid`; otherwise a provider-supported sandbox exercise does.
4. ADR-075 denies access at `unpaid` before origin forwarding or usage accounting.
5. Successful supported recovery restores an allowed state and access idempotently.
6. Recovery-exhausted-setting drift blocks activation and raises an operational alert.

## Pros and Cons of the Options

### Unpaid

- Good, because access ends without automatic cancellation.
- Bad, because recovery from `unpaid` needs explicit proof.

### Canceled

- Good, because access and the subscription end decisively.
- Bad, because it is more destructive to the customer relationship.

### Indefinitely past due

- Good, because no terminal transition is needed.
- Bad, because unpaid access can continue without a boundary.

## Reassessment Criteria

Reassess if `unpaid` no longer supports the required recovery journey or cancellation becomes a contractual requirement.

## Related

- [ADR-075 — Past-due access follows Stripe recovery](075-past-due-access-follows-stripe-recovery.proposed.md)
- [ADR-076 — Stripe Smart Retries own payment-recovery timing](076-stripe-smart-retries-own-payment-recovery-timing.proposed.md)
- [ADR-083 — Past-due recovery lasts at most fourteen days](083-past-due-recovery-lasts-at-most-fourteen-days.proposed.md)
