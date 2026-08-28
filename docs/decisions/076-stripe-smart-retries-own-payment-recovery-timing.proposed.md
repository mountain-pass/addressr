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

# Stripe Smart Retries own payment-recovery timing

## Context and Problem Statement

ADR-075 proposes access while Stripe recovers a `past_due` subscription. Addressr must decide whether Stripe adapts retry timing or follows a fixed schedule.

## Decision Drivers

- Recover transient payment failures without an Addressr scheduler.
- Use provider evidence to choose retry timing.
- Keep one payment-recovery clock.
- Detect provider-setting drift before it changes customer access duration.

## Considered Options

1. **Use Stripe Smart Retries (proposed).**
2. **Use a fixed Stripe retry schedule.**
3. **Run an Addressr-managed retry schedule.**

## Decision Outcome

Proposed option: **"Use Stripe Smart Retries."** Stripe chooses retry timing from its recovery signals. Addressr projects the resulting subscription and invoice events but runs no competing retry or grace-period timer.

## Consequences

### Good

- No Addressr retry scheduler or payment heuristics.
- Stripe can adapt timing as recovery evidence changes.
- One provider-owned clock determines the recovery window.

### Neutral

- Addressr does not promise a fixed retry schedule.

### Bad

- Dashboard configuration drift can change the recovery window.
- Provider-selected timing is less predictable than a fixed schedule.

## Confirmation

1. Authenticated Stripe settings readback proves Smart Retries before production activation.
2. Signed-webhook behavioural tests exercise duplicate, reordered and retry events without any Addressr timer.
3. After authenticated proof of support for the exact enabled configuration, a Stripe sandbox or Test Clock exercise demonstrates the transition; otherwise a provider-supported sandbox exercise does.
4. Addressr does not schedule invoice retries or independently expire a grace period.
5. Configuration drift blocks activation and raises an operational alert.

## Pros and Cons of the Options

### Smart Retries

- Good, because Stripe adapts timing without new local machinery.
- Bad, because the exact schedule is provider-selected.

### Fixed Stripe schedule

- Good, because retry timing is predictable and remains provider-operated.
- Bad, because a fixed sequence gives up adaptive recovery.

### Addressr-managed schedule

- Good, because Addressr controls every retry time.
- Bad, because it duplicates provider scheduling and adds money-path state.

## Reassessment Criteria

Reassess if Smart Retries underperform an evidenced fixed schedule or the settings cannot be read back reliably.

## Related

- [ADR-069 — Stripe state projected through signed webhooks](069-stripe-state-projected-through-signed-webhooks.proposed.md)
- [ADR-075 — Past-due access follows Stripe recovery](075-past-due-access-follows-stripe-recovery.proposed.md)
- [ADR-079 — Exhausted payment recovery marks subscriptions unpaid](079-exhausted-payment-recovery-marks-subscriptions-unpaid.proposed.md)
- [ADR-083 — Past-due recovery lasts at most fourteen days](083-past-due-recovery-lasts-at-most-fourteen-days.proposed.md)
