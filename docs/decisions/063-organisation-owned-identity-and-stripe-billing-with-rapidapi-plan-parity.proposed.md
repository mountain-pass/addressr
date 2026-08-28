---
status: 'proposed'
date: 2026-08-28
human-oversight: unconfirmed
decision-makers: [Tom Howard]
consulted: [wr-architect:agent]
informed: []
reassessment-date: 2026-11-28
---

# Organisation-owned identity and Stripe billing with RapidAPI-plan parity

## Context and Problem Statement

The Addressr-managed channel selected by ADR-061 needs users, shared customer accounts, API keys, subscriptions, payment recovery, plan entitlements and authoritative usage accounting. Addressr already has a Stripe account, but Stripe is not an application identity provider and the request path must not depend on synchronous Stripe reads.

The launch catalogue should match the existing customer-facing RapidAPI plans so buyers can compare channels without a deliberately different price architecture. The public repository must not record confidential pricing-tier details. An authenticated RapidAPI readback therefore needs to verify the private catalogue before any matching Stripe products become live.

## Decision Drivers

- The primary buyer is an organisation improving address-data quality, not merely an individual developer.
- Membership, invitations and roles should use a managed identity product rather than custom authentication code.
- Stripe-hosted surfaces should own payment collection and billing self-service.
- Customer access must continue during temporary provider latency and stop predictably when entitlement changes.
- API keys, entitlements and usage need a local, auditable source for request-time decisions.
- Plan parity must be verified from the live RapidAPI configuration rather than inferred from old website copy.
- Money, quota and webhook operations must be idempotent and recoverable.

## Considered Options

1. **Clerk organisations plus Stripe-hosted billing and local entitlement state (chosen).**
2. **Build authentication, organisations and billing screens in Addressr.**
3. **Use Stripe Customer records as application identity.**
4. **Delegate the Addressr-managed channel to another API marketplace.**

## Decision Outcome

Chosen option: **"Clerk organisations plus Stripe-hosted billing and local entitlement state."**

Clerk provides users, organisations, membership, invitations and roles. The commercial owner is the organisation: one Addressr organisation maps to one Stripe Customer and owns its subscriptions, API-key namespace, usage and invoices. A person may belong to more than one organisation without sharing keys or billing between them.

Stripe Checkout creates subscriptions and the Stripe Customer Portal handles payment methods, invoices, cancellation and supported plan changes. Signed webhooks are the authority for copying Stripe subscription state into the D1 entitlement records selected by ADR-062. Webhook processing is idempotent, order-aware and retryable. Neither the browser session nor an API request calls Stripe or Clerk to decide whether a request may proceed.

API keys are generated once, shown once, stored only as a secure hash, scoped to an organisation, individually named and revocable. Request-time entitlement checks use the local record selected by the key. Usage records carry an organisation, key, plan, request outcome, timestamp and stable idempotency key. Stripe meter events are emitted asynchronously from durable records and can be reconciled and replayed without double charging.

The launch catalogue mirrors every currently offered RapidAPI plan rather than inventing a new plan architecture. Before activation, an authenticated export or readback must establish, in an approved confidential record, each plan's name, price, currency, included allowance, overage price, hard/soft limit behaviour, billable response outcomes, billing-period/reset timing, and active or grandfathered versions. The Stripe configuration is then compared to that record. A difference returns to human review; it is not silently normalised in implementation or copied into this public repository.

Failed-payment behaviour is staged: `invoice.payment_failed` marks the organisation past due and starts a documented grace period; it does not immediately revoke API keys. Entitlement ends only on an explicit terminal subscription state or at the grace-period deadline. Recovery restores the local entitlement idempotently. The grace-period duration and terminal-state mapping must be recorded before production activation.

## Consequences

### Good

- Organisations, roles and invitations use a managed identity service.
- Stripe owns sensitive payment collection and common billing self-service.
- Request authorization remains available without synchronous identity or billing-provider calls.
- Hashed, organisation-scoped keys and durable events support revocation, audit and reconciliation.
- Verified plan parity makes the two channels easier to explain.

### Neutral

- Clerk is the identity source, Stripe the billing source, and Addressr the entitlement/usage source; explicit identifiers connect them.
- RapidAPI customers remain entirely outside this account model unless they independently create an Addressr-managed account.

### Bad

- Addressr takes responsibility for account recovery, membership authorization, webhook correctness, tax configuration, failed payments and billing support.
- Provider state can arrive late or out of order, so reconciliation is a permanent operational requirement.
- Matching price labels does not guarantee equal tax, marketplace fee, invoice or cancellation experiences.

## Confirmation

1. An authenticated RapidAPI export/readback records every active and grandfathered plan version and the full pricing, allowance, overage, billable-response and reset semantics in an approved confidential location before any Stripe product is activated.
2. The proposed Stripe catalogue either matches that verified configuration or returns to human review with every difference stated explicitly.
3. A Clerk organisation maps to exactly one Stripe Customer; its members can have roles, and membership in one organisation grants no access to another organisation's keys, usage or billing.
4. Checkout completion alone does not authorize requests. A verified, idempotently processed Stripe webhook creates the local entitlement used by the gateway.
5. Duplicate, delayed and out-of-order webhook deliveries converge on the correct entitlement without duplicate organisations, subscriptions or credits.
6. API key plaintext is displayed only at creation, never stored or logged, and revoking one key does not revoke sibling keys unless the organisation entitlement ends.
7. API authorization succeeds from local state while Clerk and Stripe request APIs are unavailable; no API request path calls either provider.
8. Each Stripe plan enforces the same verified allowance, metering, hard/soft limit and overage semantics as its RapidAPI counterpart, including atomic hard stops where the source plan has one.
9. Replaying a durable usage record or Stripe meter event with the same idempotency key cannot increase billed quantity twice, and reconciliation reports missing or mismatched events.
10. Before launch, the failed-payment grace duration, terminal Stripe states, cancellation timing, refund/credit handling, tax settings and support runbook are documented and exercised in Stripe test mode.
11. Checkout, portal return, invitation, role change, key creation/revocation, payment failure/recovery and cancellation each have observable end-to-end tests; no test uses source-text inspection as a proxy for behaviour.

## Pros and Cons of the Options

### Clerk, Stripe and local entitlements

- Good, because each system owns the job it is designed for and the request path stays local.
- Bad, because identifiers, webhooks and reconciliation connect three systems.

### Build the whole account and billing stack

- Good, because Addressr would control every screen and record.
- Bad, because authentication, recovery and payment UI add high-risk work with no demonstrated product advantage.

### Stripe as identity

- Good, because it avoids another vendor.
- Bad, because Stripe Customers do not provide application sessions, organisation membership, roles or invitations.

### Another marketplace

- Good, because marketplace infrastructure could again absorb commercial operations.
- Bad, because it does not create the Addressr-owned customer journey selected by ADR-061.

## Reassessment Criteria

Reassess if Clerk cannot support required organisation or accessibility journeys, Stripe changes hosted billing capabilities or meter semantics materially, reconciliation discrepancies exceed an agreed threshold in two billing periods, the direct channel requires enterprise contracts or invoicing outside the catalogue, or verified RapidAPI plans diverge from the parity target.

## Related

- [ADR-061 — RapidAPI and Addressr-managed dual distribution](061-rapidapi-and-addressr-managed-dual-distribution.proposed.md) — establishes the Addressr-managed channel without migrating RapidAPI users.
- [ADR-062 — Cloudflare edge customer gateway with origin-independent server](062-cloudflare-edge-customer-gateway-with-origin-independent-server.proposed.md) — enforces local keys and entitlements at request time.
