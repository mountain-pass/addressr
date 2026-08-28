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

# Past-due recovery lasts at most fourteen days

## Context and Problem Statement

ADR-075 proposes continued access during `past_due`, and ADR-076 lets Stripe choose retry timing. Smart Retries still requires Addressr to choose the number of attempts and maximum duration, which sets the maximum unpaid-access exposure.

## Decision Drivers

- Put a numeric ceiling on unpaid managed access.
- Give recoverable failures enough time for payment-method updates.
- Use a provider-supported configuration.
- Keep the window independent of Smart Retry timing.

## Considered Options

1. **Eight attempts within fourteen days (proposed).**
2. **A shorter seven-day maximum.**
3. **Immediate suspension with no `past_due` access window.**

## Decision Outcome

Proposed option: **"Eight attempts within fourteen days."** Stripe Smart Retries may choose attempt timing, but recovery must finish within fourteen days and no more than eight attempts. This uses Stripe's documented recommended default while putting an explicit ceiling on ADR-075's revenue exposure.

## Consequences

### Good

- The access window has a deterministic maximum.
- The launch uses a provider-supported recommended configuration.
- Customers have time to replace a failed payment method.

### Neutral

- Smart Retries still chooses individual attempt times inside the window.

### Bad

- An unpaid customer can consume managed quota for up to fourteen days.
- A shorter window might reduce revenue exposure at the cost of recovery.

## Confirmation

1. Authenticated Stripe settings readback proves eight attempts within fourteen days before activation.
2. Signed-webhook behavioural tests keep `past_due` access inside the window and deny it at the configured recovery-exhausted state.
3. Provider-supported sandbox evidence exercises recovery and exhaustion for the exact enabled configuration.
4. No local timer extends or shortens the Stripe window.
5. Retry-count or duration drift blocks activation and raises an operational alert.

## Pros and Cons of the Options

### Fourteen days

- Good, because it follows Stripe's documented recommended default.
- Bad, because it allows the longest proposed revenue exposure.

### Seven days

- Good, because it halves the maximum exposure.
- Bad, because it gives customers less time to recover payment.

### Immediate suspension

- Good, because it eliminates past-due usage exposure.
- Bad, because transient payment failures interrupt working integrations immediately.

## Reassessment Criteria

Reassess when confidential recovery and loss evidence supports a different maximum or Stripe changes the available retry windows.

## Related

- [ADR-075 — Past-due access follows Stripe recovery](075-past-due-access-follows-stripe-recovery.proposed.md)
- [ADR-076 — Stripe Smart Retries own payment-recovery timing](076-stripe-smart-retries-own-payment-recovery-timing.proposed.md)
- [ADR-079 — Exhausted payment recovery marks subscriptions unpaid](079-exhausted-payment-recovery-marks-subscriptions-unpaid.proposed.md)
