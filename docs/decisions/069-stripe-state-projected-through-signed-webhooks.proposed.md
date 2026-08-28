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

# Stripe state projected through signed webhooks

## Context and Problem Statement

The gateway needs local entitlement without calling Stripe or Clerk on every API request. Addressr must choose how provider subscription changes become request-time entitlement state.

## Decision Drivers

- Keep provider latency and outages out of the API request path.
- Verify that subscription changes came from Stripe.
- Converge safely under duplicate, delayed and out-of-order delivery.
- Make entitlement projection auditable and recoverable.

## Considered Options

1. **Signed webhook projection (chosen).**
2. **Synchronous Stripe lookup per API request.**
3. **Periodic polling only.**

## Decision Outcome

Chosen option: **"Signed webhook projection."** Verified Stripe webhooks update D1 entitlement snapshots through idempotent, order-aware processing. The gateway authorizes from that local projection and never calls Stripe or Clerk synchronously.

This decision does not choose how access changes after a failed payment. That policy requires a separate human decision before production activation.

## Consequences

### Good

- API authorization continues through temporary provider API latency or outage.
- Duplicate and reordered events can converge deterministically.
- Entitlement changes leave durable evidence.

### Neutral

- Local state is a projection and may briefly lag Stripe.

### Bad

- Webhook verification, ordering, replay and reconciliation become load-bearing.
- Operational tools must repair missed or poisoned events safely.

## Confirmation

1. Invalidly signed webhook requests cannot change entitlement.
2. Checkout completion alone does not authorize API requests before the verified projection exists.
3. Duplicate and out-of-order deliveries converge without duplicate subscriptions or credits.
4. Authorization succeeds from local state while Stripe and Clerk request APIs are unavailable.
5. Reconciliation detects and repairs a missing projection without directly editing customer entitlement by hand.

## Pros and Cons of the Options

### Signed webhook projection

- Good, because request-time authorization stays local and provider changes remain authenticated.
- Bad, because eventual delivery needs reconciliation.

### Synchronous lookup

- Good, because Stripe state would be read at decision time.
- Bad, because provider latency and availability become API dependencies.

### Polling only

- Good, because it avoids a public webhook endpoint.
- Bad, because entitlement changes would lag the polling interval.

## Reassessment Criteria

Reassess if webhook delivery cannot meet the accepted entitlement-lag objective or Stripe offers a stronger event-replication mechanism.

## Related

- [ADR-064 — Commercial request state stored in Cloudflare D1](064-commercial-request-state-stored-in-cloudflare-d1.proposed.md)
- [ADR-068 — Stripe-hosted billing interactions](068-stripe-hosted-billing-interactions.proposed.md)
