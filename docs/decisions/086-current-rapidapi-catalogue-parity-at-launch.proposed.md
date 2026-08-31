---
status: 'proposed'
date: 2026-09-01
human-oversight: confirmed
oversight-date: 2026-09-01
decision-makers: [Tom Howard]
consulted: [wr-architect:agent]
informed: []
reassessment-date: 2026-12-01
supersedes: [072-rapidapi-catalogue-parity-at-launch]
---

# Current RapidAPI catalogue parity at launch

## Context and Problem Statement

ADR-072 required evidence for current and grandfathered RapidAPI plan versions. Existing RapidAPI subscribers remain on RapidAPI under ADR-061 and are not migrated, repriced or linked to the Addressr-managed channel. Historical plan-version parity therefore does not protect a launch journey.

The Addressr-managed launch still needs evidence that its new customer offer matches the current RapidAPI catalogue without publishing confidential commercial terms.

## Decision Drivers

- Compare the offers available to new customers at launch.
- Leave every existing RapidAPI subscriber and plan version unchanged.
- Keep confidential catalogue details outside the public repository.
- Retain provider-specific billing evidence that can affect customer charges.

## Considered Options

1. **Verify the current public RapidAPI catalogue in USD (chosen).**
2. Verify current and historical RapidAPI plan versions.
3. Design a different Addressr-managed catalogue.

## Decision Outcome

Chosen option: **"Verify the current public RapidAPI catalogue in USD."** The Addressr-managed Stripe catalogue mirrors the current public RapidAPI plan names and commercial semantics. Historical and grandfathered RapidAPI plan versions are outside this launch comparison because their subscribers remain on RapidAPI.

An authenticated confidential record remains the evidence source. Reset timing and billable-outcome parity remain launch gates. Any material difference returns to human review rather than being normalised silently.

## Consequences

### Good

- Verification covers the offers a new customer can actually choose.
- Launch does not depend on inaccessible or irrelevant historical provider versions.
- Existing RapidAPI subscribers remain isolated from the new channel.

### Neutral

- Marketplace fees, tax, invoices and cancellation experience may differ by provider.

### Bad

- Current catalogue drift still requires a confidential comparison before activation and future changes.
- Reset and billable-outcome semantics still require provider evidence.

## Confirmation

1. An authenticated confidential record captures each current public RapidAPI plan's name, USD price, allowance, overage and hard/soft-limit behaviour.
2. The record establishes the current monthly reset timing and the origin outcomes that increment usage.
3. Stripe products remain inactive until a reviewer confirms parity against that record.
4. Every material difference is stated for human decision; no implementation silently rounds or substitutes a term.
5. No confidential price, allowance, subscriber or traffic figure enters the public repository.
6. Launch and later catalogue changes do not alter an existing RapidAPI subscriber, key, plan version or billing relationship.

## Pros and Cons of the Options

### Current public catalogue

- Good, because it matches the choice presented to new customers.
- Bad, because it does not reproduce terms unavailable to new customers.

### Current and historical versions

- Good, because it would create a complete provider archive.
- Bad, because no historical subscriber is migrated and the archive does not reduce launch risk.

### Different managed catalogue

- Good, because Addressr could optimise the direct-channel offer.
- Bad, because it adds a pricing decision and customer explanation to launch.

## Reassessment Criteria

Reassess if existing RapidAPI subscribers are considered for migration, the current catalogue changes materially, or provider constraints prevent current-plan parity.

## Related

- [ADR-061 — RapidAPI and Addressr-managed dual distribution](061-rapidapi-and-addressr-managed-dual-distribution.proposed.md)
- [ADR-068 — Stripe-hosted billing interactions](068-stripe-hosted-billing-interactions.proposed.md)
- [ADR-071 — Stripe meter events emitted from idempotent usage records](071-stripe-meter-events-emitted-from-idempotent-usage-records.proposed.md)
- [ADR-072 — RapidAPI catalogue parity at launch](072-rapidapi-catalogue-parity-at-launch.superseded.md) — superseded by this current-catalogue scope.
