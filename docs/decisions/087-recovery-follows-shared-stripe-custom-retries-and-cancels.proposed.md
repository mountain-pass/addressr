---
status: 'proposed'
date: 2026-09-03
human-oversight: unconfirmed
decision-makers: [Tom Howard]
consulted: [wr-architect:agent]
informed: []
supersedes:
  [
    076-stripe-smart-retries-own-payment-recovery-timing,
    079-exhausted-payment-recovery-marks-subscriptions-unpaid,
    083-past-due-recovery-lasts-at-most-fourteen-days,
  ]
reassessment-date: 2026-12-03
---

# Recovery follows the shared Stripe account's custom retries and cancels on exhaustion

> Captured via /wr-architect:capture-adr (foreground-lightweight aside-invocation per ADR-032, derived-substance amendment 2026-07-06 / RFC-045). Section content was derived by the capturing agent from the in-session decision context; human-oversight: unconfirmed until ratified at the /wr-architect:review-decisions drain.

## Context and Problem Statement

ADR-076, ADR-079 and ADR-083 assumed the Stripe account would recover failed subscription payments with Smart Retries, at most eight attempts within fourteen days, and mark the subscription `unpaid` when recovery is exhausted. Each carried a confirmation criterion that configuration drift blocks activation.

An authenticated dashboard readback on 2026-09-03, recorded in the managed-channel launch readiness ledger, found the account configured differently: card retries enabled with **Custom retries** at 3, 5 and 7 days after each failed attempt (three attempts, fifteen days) and **cancel the subscription** when all retries fail, with the invoice left overdue. The ledger's 2026-08-30 reading of Smart Retries and terminal `unpaid` no longer described the account.

The Stripe account is shared with another product, so the retry policy is not Addressr's alone to set. The maintainer had to decide which side moves: the account setting, the three decisions, or the account boundary.

The superseded decisions said, in full:

- ADR-076: "Use Stripe Smart Retries. Stripe chooses retry timing from its recovery signals. Addressr projects the resulting subscription and invoice events but runs no competing retry or grace-period timer."
- ADR-079: "Mark the subscription `unpaid`. When Stripe exhausts its configured payment recovery, it moves the subscription to the recoverable `unpaid` state. ADR-075 denies managed API access without automatically canceling the customer relationship."
- ADR-083: "Eight attempts within fourteen days. Stripe Smart Retries may choose attempt timing, but recovery must finish within fourteen days and no more than eight attempts."

## Decision Drivers

- The Stripe account is shared with another product, so an account-wide change has a blast radius outside Addressr.
- Addressr must not own a retry timer; one provider clock decides the recovery window.
- Provider-setting drift must be detectable before it changes how long a customer keeps access.
- ADR-075's access semantics (`past_due` keeps access; `unpaid`, `canceled` and the rest deny) must stay unchanged.
- The Worker already denies at `canceled` and projects `customer.subscription.deleted`, so the observed policy needs no new code path.

## Considered Options

1. **Supersede the three decisions to match the observed account policy (chosen)** — record custom retries at 3, 5 and 7 days and cancellation on exhaustion as Addressr's recovery policy.
2. **Change the shared account to Smart Retries with terminal `unpaid`** — keeps ADR-076, ADR-079 and ADR-083 as written, but alters the other product's recovery behaviour.
3. **Isolate Addressr billing in its own Stripe account or mechanism** — lets the old decisions hold without touching the other product, at the cost of a second account, catalogue and webhook spine.

## Decision Outcome

Chosen option: **"Supersede the three decisions to match the observed account policy"**, because the retry schedule is an account-wide setting shared with another product, and the maintainer chose on 2026-09-03 not to alter that product's recovery or to split the account for a channel that has not launched. Addressr follows the account's configured schedule: three custom retries at 3, 5 and 7 days after each failed attempt, then Stripe cancels the subscription and leaves the invoice overdue. Addressr runs no competing timer. ADR-075, ADR-081 and ADR-082 are unchanged.

## Consequences

### Good

- No account-wide Stripe change and no effect on the other product.
- One provider-owned clock still decides the recovery window.
- The window is fixed and predictable: fifteen days from the first failure.
- No Worker code change is implied; `canceled` is already a deny state and `customer.subscription.deleted` is already projected.

### Neutral

- ADR-075's `past_due` grace behaviour applies unchanged during the fifteen days.
- The readiness ledger's payment-recovery row now measures against this schedule rather than the superseded one.

### Bad

- Stripe reports `canceled` on exhaustion and ADR-075 treats `canceled` as terminal deny, so ADR-079's "relationship preserved via `unpaid`" property is lost: a customer who recovers after the window must subscribe again.
- Three fixed attempts over fifteen days replace up to eight adaptive attempts within fourteen; recovery is less adaptive.
- The policy is still a shared dashboard setting, so drift remains possible and must keep blocking activation.

## Confirmation

1. Authenticated Stripe settings readback proves card retries enabled, Custom retries at 3, 5 and 7 days, and "cancel the subscription" on exhaustion before activation, and is re-read immediately before any activation decision.
2. Signed-webhook behavioural tests cover duplicate, reordered and recovery-exhausted events ending in `customer.subscription.deleted`.
3. A Stripe Test Clock exercise in test mode reaches `canceled` through the configured schedule.
4. No Addressr timer schedules retries or extends or shortens the window.
5. Configuration drift from this schedule blocks activation.

## Pros and Cons of the Options

### Supersede the three decisions

- Good, because it matches provider reality without touching the other product.
- Good, because it needs no new machinery.
- Bad, because cancellation ends the customer relationship instead of pausing it.

### Change the shared account setting

- Good, because the ratified decisions would hold as written.
- Bad, because it changes recovery behaviour for another product's subscribers.

### Isolate Addressr billing

- Good, because Addressr would own its recovery policy outright.
- Bad, because it adds a second account, catalogue, webhook destination and secret spine before the channel has a single customer.

## Reassessment Criteria

Reassess if Addressr billing is isolated from the shared account, if Stripe offers a per-subscription or per-product retry policy, if the cost of losing customers to cancellation proves material, or if the other product's needs change the shared setting.

## Related

- [ADR-069 Stripe state projected through signed webhooks](069-stripe-state-projected-through-signed-webhooks.proposed.md)
- [ADR-075 Past-due access follows Stripe recovery](075-past-due-access-follows-stripe-recovery.proposed.md)
- [ADR-076 Stripe Smart Retries own payment-recovery timing](076-stripe-smart-retries-own-payment-recovery-timing.superseded.md) — superseded by this decision
- [ADR-079 Exhausted payment recovery marks subscriptions unpaid](079-exhausted-payment-recovery-marks-subscriptions-unpaid.superseded.md) — superseded by this decision
- [ADR-081 Stripe collection pausing prohibited for managed subscriptions](081-stripe-collection-pausing-prohibited-for-managed-subscriptions.proposed.md)
- [ADR-082 Managed-channel launch uses immediate-outcome payment methods](082-managed-channel-launch-uses-immediate-outcome-payment-methods.proposed.md)
- [ADR-083 Past-due recovery lasts at most fourteen days](083-past-due-recovery-lasts-at-most-fourteen-days.superseded.md) — superseded by this decision
