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

# Abuse throttling separated from commercial accounting

## Context and Problem Statement

Cloudflare rate limiting is fast protection against abusive traffic, but its distributed eventually consistent counters are not accurate billing records. The direct channel needs an explicit boundary between protective throttling and authoritative quota or usage decisions.

## Decision Drivers

- Do not overcharge or exceed a hard quota because of approximate counters.
- Reject abuse cheaply before durable accounting work.
- Make billing and quota evidence replayable and auditable.
- Keep each control responsible for one purpose.

## Considered Options

1. **Separate rate limiting from authoritative accounting (chosen).**
2. **Use Cloudflare rate-limit counters for both purposes.**
3. **Use durable accounting for both abuse and commercial limits.**

## Decision Outcome

Chosen option: **"Separate rate limiting from authoritative accounting."** Cloudflare rate limiting protects availability and cost. D1 conditional records decide customer quota and billable usage. A rate-limit event is never itself a billing event.

## Consequences

### Good

- Approximate distributed counters cannot become invoice evidence.
- Cheap abuse rejection reduces durable-store load.
- Commercial events remain reconcilable and idempotent.

### Neutral

- A request can be acceptable under one limit and rejected under the other for different reasons.

### Bad

- Operators and customers need distinguishable errors and metrics for two limit systems.
- Two controls require separate tests and tuning.

## Confirmation

1. Abuse tests exercise Cloudflare rate limiting without creating usage records for rejected traffic.
2. Quota and billing tests use D1 state and never assert on rate-limit counters.
3. Responses and logs distinguish abuse throttling from exhausted commercial entitlement.
4. Disabling abuse throttling in a test environment does not disable commercial quota enforcement.

## Pros and Cons of the Options

### Separate controls

- Good, because each mechanism matches its consistency requirement.
- Bad, because customers can encounter two distinct limit responses.

### Rate limiter for both

- Good, because it is the smallest implementation.
- Bad, because approximate counters are not reliable commercial evidence.

### Durable accounting for both

- Good, because all limits would use one state model.
- Bad, because abusive traffic would consume the expensive authoritative path.

## Reassessment Criteria

Reassess if Cloudflare offers strongly consistent accounting counters with durable event export, or if operating two limit systems causes repeated customer confusion.

## Related

- [ADR-064 — Commercial request state stored in Cloudflare D1](064-commercial-request-state-stored-in-cloudflare-d1.proposed.md)
- [ADR-071 — Stripe meter events emitted from idempotent usage records](071-stripe-meter-events-emitted-from-idempotent-usage-records.proposed.md)
