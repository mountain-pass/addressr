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

# Stripe meter events emitted from idempotent usage records

## Context and Problem Statement

The gateway records billable usage, while Stripe calculates metered charges. Addressr must choose whether each request calls Stripe synchronously or whether durable usage is delivered asynchronously.

## Decision Drivers

- Keep Stripe latency and availability out of API requests.
- Prevent retries from charging the same usage twice.
- Detect and repair missing usage delivery.
- Preserve an audit trail from accepted request to billing event.

## Considered Options

1. **Asynchronous meter events from idempotent usage records (chosen).**
2. **Synchronous Stripe call on every request.**
3. **Untracked periodic aggregate submission.**

## Decision Outcome

Chosen option: **"Asynchronous meter events from idempotent usage records."** The gateway first commits an authoritative usage record with a stable idempotency identity. A separate delivery process emits the corresponding Stripe meter event and records its delivery state. Reconciliation may replay undelivered records without increasing billed quantity twice.

## Consequences

### Good

- API requests do not wait for Stripe.
- Delivery retries are safe and auditable.
- Missing and mismatched events can be reconciled.

### Neutral

- Stripe's view of usage can lag accepted requests.

### Bad

- Addressr operates a delivery queue and reconciliation process.
- Billing incidents can arise even while API service remains healthy.

## Confirmation

1. The request path contains no synchronous Stripe meter call.
2. Every billable request creates at most one authoritative usage identity.
3. Replaying a usage record cannot increase Stripe quantity twice.
4. Reconciliation reports missing, rejected and mismatched events and can retry them safely.
5. Non-billable and abuse-rejected requests do not emit meter events.

## Pros and Cons of the Options

### Asynchronous idempotent delivery

- Good, because it isolates request availability from Stripe and supports safe replay.
- Bad, because it adds eventual consistency and reconciliation operations.

### Synchronous delivery

- Good, because Stripe receives usage immediately.
- Bad, because Stripe becomes a request-path dependency.

### Untracked aggregation

- Good, because it reduces event volume.
- Bad, because individual request-to-bill traceability and safe replay are lost.

## Reassessment Criteria

Reassess if Stripe meter semantics change materially, reconciliation discrepancies recur, or event volume requires verified aggregation while retaining idempotency.

## Related

- [ADR-065 — Abuse throttling separated from commercial accounting](065-abuse-throttling-separated-from-commercial-accounting.proposed.md)
- [ADR-072 — RapidAPI catalogue parity at launch](072-rapidapi-catalogue-parity-at-launch.proposed.md)
