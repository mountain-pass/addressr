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

# Past-due access follows Stripe recovery

## Context and Problem Statement

ADR-069 projects Stripe state into local entitlement but deliberately does not decide when a failed payment removes access. Addressr needs one fail-closed mapping from Stripe subscription status to managed API access.

## Decision Drivers

- Avoid suspending a customer for a transient payment failure that Stripe is still recovering.
- Stop access at a deterministic provider state.
- Avoid a second Addressr-managed grace-period clock.
- Fail closed for missing, malformed or new states.

## Considered Options

1. **Keep access while Stripe reports `past_due` (proposed).**
2. **Suspend on the first failed invoice.**
3. **Run an Addressr-managed fixed grace period.**

## Decision Outcome

Proposed option: **"Keep access while Stripe reports `past_due`."** Subject to ADR-081 and ADR-082, `active`, `trialing` and `past_due` retain access. `incomplete`, `incomplete_expired`, `unpaid`, `paused`, `canceled`, missing, malformed and unknown states deny access.

`invoice.payment_failed` updates recovery evidence but does not by itself revoke an already entitled customer. `cancel_at_period_end` retains access only while the subscription remains in an allowed status; access ends when Stripe reports `canceled`.

## Consequences

### Good

- A recoverable card failure does not immediately interrupt a working integration.
- Stripe state remains the only access-policy clock.
- Unknown states cannot accidentally grant access.

### Neutral

- A `past_due` customer continues consuming quota while Stripe retries payment.

### Bad

- Revenue exposure lasts for Stripe's configured recovery window.
- Incorrect Stripe recovery settings or unsupported collection conditions could leave access open too long unless the separate launch constraints fail closed.

## Confirmation

1. A behavioural test covers every documented Stripe subscription status plus missing, malformed and unknown states.
2. `invoice.payment_failed` alone does not revoke an already active customer.
3. `cancel_at_period_end` retains access only until Stripe reports `canceled`.
4. Successful recovery restores projected entitlement idempotently.
5. Denied or unknown states fail closed before an origin request or billable usage record.

## Pros and Cons of the Options

### Follow Stripe recovery

- Good, because transient failures get the provider-configured recovery opportunity.
- Bad, because access depends on a separately governed terminal outcome.

### Suspend on first failure

- Good, because revenue exposure ends immediately.
- Bad, because a transient failure interrupts customers before recovery can work.

### Addressr-managed grace period

- Good, because Addressr controls the exact duration.
- Bad, because two clocks can disagree and require extra state and recovery logic.

## Reassessment Criteria

Reassess if recovery-window loss exceeds appetite, Stripe changes subscription-status semantics, or customers need a contract-specific grace period.

## Related

- [ADR-069 — Stripe state projected through signed webhooks](069-stripe-state-projected-through-signed-webhooks.proposed.md)
- [ADR-076 — Stripe Smart Retries own payment-recovery timing](076-stripe-smart-retries-own-payment-recovery-timing.proposed.md)
- [ADR-079 — Exhausted payment recovery marks subscriptions unpaid](079-exhausted-payment-recovery-marks-subscriptions-unpaid.proposed.md)
- [ADR-081 — Stripe collection pausing prohibited for managed subscriptions](081-stripe-collection-pausing-prohibited-for-managed-subscriptions.proposed.md)
- [ADR-082 — Managed-channel launch uses immediate-outcome payment methods](082-managed-channel-launch-uses-immediate-outcome-payment-methods.proposed.md)
