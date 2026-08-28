---
status: 'proposed'
date: 2026-08-28
human-oversight: unconfirmed
decision-makers: [Tom Howard]
consulted: [wr-architect:agent]
informed: []
reassessment-date: 2026-11-28
---

# Stripe-hosted billing interactions

## Context and Problem Statement

The Addressr-managed channel needs subscription checkout and billing self-service. Building payment-method, invoice and cancellation screens would make Addressr responsible for sensitive payment UI that Stripe already hosts.

## Decision Drivers

- Minimise Addressr's payment-data exposure.
- Reuse the existing Stripe account.
- Give customers established checkout and billing self-service.
- Avoid custom payment-form and invoice UI.

## Considered Options

1. **Stripe Checkout and Customer Portal (chosen).**
2. **Addressr-built payment and billing screens.**
3. **Manual operator-created subscriptions.**

## Decision Outcome

Chosen option: **"Stripe Checkout and Customer Portal."** Checkout creates direct-channel subscriptions. The Customer Portal handles supported payment-method, invoice, cancellation and plan-management interactions. Addressr owns the surrounding account journey but does not collect card details itself.

## Consequences

### Good

- Stripe hosts sensitive payment interactions.
- Common billing self-service needs no custom UI.
- Tax and payment-method capabilities can use Stripe's supported surfaces.

### Neutral

- Customers move between Addressr and Stripe-hosted pages during billing tasks.

### Bad

- Visual and interaction customisation is limited by Stripe.
- Addressr must verify redirect, return and accessibility behaviour end to end.

## Confirmation

1. No Addressr page accepts or stores card details.
2. New subscriptions start through Stripe Checkout.
3. Supported payment-method, invoice, cancellation and plan tasks use the Customer Portal.
4. Return URLs preserve the owning organisation and prevent cross-organisation access.
5. Test-mode browser journeys cover successful, cancelled and abandoned interactions.

## Pros and Cons of the Options

### Stripe-hosted surfaces

- Good, because Stripe owns payment collection and common self-service.
- Bad, because the experience cannot be fully customised.

### Addressr-built surfaces

- Good, because Addressr controls the entire visual journey.
- Bad, because it expands security, compliance and accessibility scope.

### Manual subscriptions

- Good, because it needs little product UI.
- Bad, because it cannot support self-service acquisition at useful scale.

## Reassessment Criteria

Reassess if Stripe-hosted surfaces cannot support required plans, accessibility, tax, invoicing or enterprise contract journeys.

## Related

- [ADR-067 — Organisations as the commercial ownership boundary](067-organisations-as-the-commercial-ownership-boundary.proposed.md)
- [ADR-069 — Stripe state projected through signed webhooks](069-stripe-state-projected-through-signed-webhooks.proposed.md)
