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

# RapidAPI catalogue parity at launch

## Context and Problem Statement

The Addressr-managed channel needs a launch catalogue. Creating different plan economics would make the two channels harder to compare and support. The public repository must not record confidential pricing-tier details, so parity needs a private evidence source.

## Decision Drivers

- Give buyers comparable Addressr and RapidAPI offers at launch.
- Avoid silently repricing or migrating RapidAPI subscribers.
- Verify current terms rather than infer them from old website copy.
- Keep confidential pricing-tier details out of the public repository.

## Considered Options

1. **Mirror the verified RapidAPI catalogue at launch (chosen).**
2. **Design a new direct-channel catalogue.**
3. **Launch no Addressr-managed paid plans.**

## Decision Outcome

Chosen option: **"Mirror the verified RapidAPI catalogue at launch."** An authenticated RapidAPI readback records every current and grandfathered plan version in an approved confidential location. The direct Stripe catalogue mirrors the current customer-facing plan names and commercial semantics. Any difference returns to human review rather than being normalised silently.

Existing RapidAPI subscribers remain on RapidAPI under ADR-061; parity creates no migration or cross-channel account link.

## Consequences

### Good

- Customers can compare channels without learning a second plan architecture.
- Launch avoids an unrelated pricing redesign.
- Verification preserves uncertainty about stale or grandfathered configurations.

### Neutral

- Equal catalogue semantics do not make marketplace fees, tax, invoices or cancellation experience identical.

### Bad

- Addressr must maintain a confidential comparison and detect future drift.
- Provider constraints may prevent exact parity for some billing mechanics.

## Confirmation

1. An authenticated export records every current and grandfathered RapidAPI plan version's name, price, currency, allowance, overage, hard/soft-limit behaviour, billable outcomes and reset timing in an approved confidential location.
2. Stripe products are not activated until a reviewer confirms parity against that record.
3. Every difference is stated for human decision; no implementation silently rounds or substitutes a term.
4. No confidential price, allowance, subscriber or traffic figure is committed to the public repository.
5. Launch and later catalogue changes do not alter an existing RapidAPI subscriber, key or billing relationship.

## Pros and Cons of the Options

### Verified parity

- Good, because it keeps launch focused on channel ownership rather than pricing design.
- Bad, because maintaining two provider configurations creates drift risk.

### New catalogue

- Good, because Addressr could optimise direct-channel economics immediately.
- Bad, because it adds a separate product decision and customer explanation to launch.

### No managed paid plans

- Good, because it avoids billing implementation.
- Bad, because it does not provide the Addressr-managed commercial channel selected by ADR-061.

## Reassessment Criteria

Reassess after evidence shows channel-specific buyer needs, provider constraints prevent material parity, or one channel's terms change materially.

## Related

- [ADR-061 — RapidAPI and Addressr-managed dual distribution](061-rapidapi-and-addressr-managed-dual-distribution.proposed.md)
- [ADR-068 — Stripe-hosted billing interactions](068-stripe-hosted-billing-interactions.proposed.md)
- [ADR-071 — Stripe meter events emitted from idempotent usage records](071-stripe-meter-events-emitted-from-idempotent-usage-records.proposed.md)
