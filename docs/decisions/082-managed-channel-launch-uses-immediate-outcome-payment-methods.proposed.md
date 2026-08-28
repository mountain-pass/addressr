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

# Managed-channel launch uses immediate-outcome payment methods

## Context and Problem Statement

Some asynchronous payment methods can report success before later failing while a subscription remains `active`. ADR-075's status mapping alone cannot safely authorize that condition.

## Decision Drivers

- Prevent delayed payment failure from leaving apparently active access.
- Keep the first launch entitlement model status-based.
- Avoid new invoice-level authorization state until demand justifies it.
- Make Checkout reject unsupported payment methods explicitly.

## Considered Options

1. **Launch only with payment methods whose outcome drives the selected subscription states immediately (proposed).**
2. **Support asynchronous methods with invoice-level entitlement state.**
3. **Allow Stripe to choose payment methods dynamically without an Addressr allowlist.**

## Decision Outcome

Proposed option: **"Launch only with immediate-outcome payment methods."** Checkout is configured with an explicit allowlist limited to payment methods whose failure is represented by the subscription states governed in ADR-075. Methods and projected subscription configuration outside the allowlist fail closed.

## Consequences

### Good

- Subscription status remains sufficient for launch authorization.
- Delayed failures cannot silently retain access.
- No invoice-level entitlement projection is added speculatively.

### Neutral

- The exact provider allowlist is verified operational configuration rather than a public pricing detail.

### Bad

- Some customers cannot use otherwise available Stripe payment methods at launch.
- Expanding payment methods requires a new entitlement model or proof of equivalent status behaviour.

## Confirmation

1. Checkout uses an explicit authenticated payment-method allowlist rather than dynamic provider selection.
2. Each enabled method's success and failure paths drive states covered by ADR-075 in Stripe test mode.
3. Checkout rejects methods outside the allowlist, and projected subscription configuration outside it denies access before origin forwarding or usage accounting.
4. Configuration drift blocks activation and raises an operational alert.
5. No asynchronous-method claim is made without provider evidence for the exact enabled configuration.

## Pros and Cons of the Options

### Immediate-outcome methods only

- Good, because the launch authorization model stays small and fail-closed.
- Bad, because payment-method choice is narrower.

### Invoice-level support

- Good, because asynchronous payment methods can be offered safely.
- Bad, because it adds a second authorization dimension and more webhook ordering states.

### Dynamic provider selection

- Good, because Stripe can maximize payment-method availability.
- Bad, because a newly enabled method can bypass the proven entitlement model.

## Reassessment Criteria

Reassess when buyer demand justifies asynchronous methods or Stripe offers a stronger status contract for them.

## Related

- [ADR-068 — Stripe-hosted billing interactions](068-stripe-hosted-billing-interactions.proposed.md)
- [ADR-069 — Stripe state projected through signed webhooks](069-stripe-state-projected-through-signed-webhooks.proposed.md)
- [ADR-075 — Past-due access follows Stripe recovery](075-past-due-access-follows-stripe-recovery.proposed.md)
