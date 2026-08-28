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

# Customer, demo and monitoring use distinct principals

## Context and Problem Statement

The existing Worker serves website-demo and monitoring traffic and will also serve paid customer traffic if ADR-063 is ratified. Treating those paths as one principal could let a browser hint or operational credential cross the paid authorization boundary.

## Decision Drivers

- Prevent demo or monitoring credentials from authorizing paid API use.
- Keep customer usage and billing evidence free of audit traffic.
- Preserve useful demo and availability checks.
- Make each request class operationally distinguishable.

## Considered Options

1. **Use distinct customer, demo and monitoring principals (chosen).**
2. **Use one Worker-wide principal.**
3. **Remove demo and monitoring traffic from the Worker.**

## Decision Outcome

Chosen option: **"Use distinct customer, demo and monitoring principals."** Each class has separate authentication, routes, limits and usage classification. `Referer` and `Origin` are routing or policy signals only; neither can authorize paid traffic.

## Consequences

### Good

- Public demo traffic cannot become customer traffic by changing a header.
- Monitoring and demo calls cannot enter customer billing records.
- Logs can distinguish customer activity from audit traffic.

### Neutral

- The principals can share one deployed Worker without sharing authority.

### Bad

- The Worker must maintain and test three request classifications.
- Misrouting becomes a security and billing-integrity risk.

## Confirmation

1. `Referer` or `Origin` alone can never authorize a paid request.
2. Customer, demo and monitoring credentials are not interchangeable.
3. Each principal has separate routes, limits and usage classification before authorization or accounting runs.
4. Demo and monitoring requests create no customer entitlement or billable-usage record.
5. Logs distinguish retained customer activity from demo and audit traffic without exposing credentials.

## Pros and Cons of the Options

### Distinct principals

- Good, because authority and accounting remain isolated.
- Bad, because classification logic is load-bearing.

### One Worker-wide principal

- Good, because it is simple to configure.
- Bad, because browser and operational traffic could cross the paid boundary.

### Remove demo and monitoring

- Good, because it removes shared paths.
- Bad, because it discards working customer and availability evidence without need.

## Reassessment Criteria

Reassess if a principal repeatedly crosses classifications, audit needs require stronger isolation, or separate deployment becomes simpler than shared classification.

## Related

- [ADR-018 — Cloudflare Worker as API Key Proxy](018-cloudflare-worker-api-proxy.accepted.md)
- [ADR-063 — Existing Cloudflare Worker extended for the managed API](063-existing-cloudflare-worker-extended-for-the-managed-api.proposed.md)
- [ADR-065 — Abuse throttling separated from commercial accounting](065-abuse-throttling-separated-from-commercial-accounting.proposed.md)
- [ADR-071 — Stripe meter events emitted from idempotent usage records](071-stripe-meter-events-emitted-from-idempotent-usage-records.proposed.md)
