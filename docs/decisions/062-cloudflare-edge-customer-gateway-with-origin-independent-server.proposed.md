---
status: 'proposed'
date: 2026-08-28
human-oversight: unconfirmed
decision-makers: [Tom Howard]
consulted: [wr-architect:agent]
informed: []
reassessment-date: 2026-11-28
---

# Cloudflare edge customer gateway with origin-independent server

## Context and Problem Statement

ADR-018 created a Cloudflare Worker that authenticates the public website by `Referer` or monitoring IP, injects a RapidAPI key, and forwards every accepted request through RapidAPI. ADR-032 brought that Worker under Terraform control. Those decisions suit a browser demo proxy, not an Addressr-managed commercial API: a paid caller needs its own key, entitlement, limits and usage record, and `Referer` is not authentication.

Putting Stripe, customer accounts and API-key enforcement inside the Addressr search server would couple the reusable server to one hosted business model and would disturb self-hosted users. ADR-024 already supplies the correct origin boundary: an optional, gateway-agnostic shared header/value pair that is disabled for self-hosted deployments.

## Decision Drivers

- The Addressr server must remain usable without Clerk, Stripe or Cloudflare.
- Paid requests require per-organisation authentication and entitlement enforcement before reaching the origin.
- Billable usage and hard quotas must not rely on Cloudflare's eventually consistent rate-limiting counters.
- The website demo must remain possible without turning `Referer` into customer authentication.
- RapidAPI must continue reaching the same redundant origins.
- Missing secrets, storage bindings or origin configuration must fail loud.
- Infrastructure remains version-controlled and deployed through the existing Terraform/release path.

## Considered Options

1. **Expand the existing Cloudflare Worker into the Addressr-managed customer gateway (chosen).**
2. **Add customer identity, plans and Stripe billing to the Addressr server.**
3. **Create a second gateway stack alongside the existing Worker.**
4. **Keep RapidAPI as the only gateway.**

## Decision Outcome

Chosen option: **"Expand the existing Cloudflare Worker into the Addressr-managed customer gateway."**

If ratified, this decision supersedes ADR-018 and ADR-032 in full while retaining Terraform as the deployment mechanism. Until then, both earlier decisions remain in force.

The Worker at `api.addressr.io` validates Addressr-issued API keys, resolves the owning organisation's local entitlement, applies plan and abuse limits, writes durable idempotent usage records, and forwards accepted requests directly to the existing Addressr origins. Both RapidAPI and the Cloudflare gateway inject the same configured header/value pair already enforced by ADR-024; the origin continues to authenticate a trusted gateway rather than distinguish channels. Rotation of that pair is coordinated across both gateways and both origins.

The origin remains unaware of customers, Clerk, Stripe, product plans and API keys. Self-hosted deployments keep ADR-024's default-off behaviour. The gateway preserves both production origins and their existing failover behaviour.

The public website demo is a separate, explicitly named non-customer principal with its own tight rate limit and permitted routes. Browser `Referer` or `Origin` may help restrict that demo principal, but neither header authenticates Addressr-managed paid traffic. Monitoring is also a separate principal rather than a customer key.

Cloudflare's native rate limiter is used only for abuse protection. D1 is the local system of record for API-key hashes, organisation linkage, entitlement snapshots and idempotent usage events. Customer quotas and billable usage use an authoritative D1 conditional update with a stable idempotency key. The request path does not call Clerk or Stripe. If production-like concurrency testing cannot prove the required hard-stop and idempotency semantics with D1, implementation stops for a superseding storage decision rather than adding a second store implicitly.

Terraform remains the deployment mechanism selected by ADR-032. This ADR supersedes ADR-032 because the Worker purpose, bindings, secrets, request flow and confirmation surface change; it retains the deployment mechanism rather than reopening Terraform versus Wrangler.

Before implementation is accepted, a measured latency and resource budget must be recorded against a representative request path. The current unmeasured planning bound is 1 ms of Worker CPU, 16 KiB transient memory, 2 KB internal storage traffic and 105 ms added wall time per request under a worst-case two-durable-operation model. This is a hypothesis, not a production claim.

## Consequences

### Good

- Hosted commercial concerns stay at the hosted gateway boundary.
- The server and self-hosted distributions stay independent of Addressr's account and billing vendors.
- Direct traffic avoids an unnecessary RapidAPI round trip while RapidAPI remains available.
- One existing Worker, Terraform state and origin-secret mechanism are reused.

### Neutral

- ADR-024 remains in force unchanged; it authenticates gateways, not end customers.
- Cloudflare rate limiting and durable commercial accounting serve different purposes.

### Bad

- The gateway becomes a revenue-critical stateful boundary rather than a small key-injecting proxy.
- Durable entitlement and usage work adds latency and a new availability dependency to direct requests.
- The demo, monitoring, direct-customer and RapidAPI paths require distinct tests and operational evidence.

## Confirmation

1. A valid Addressr API key with an active entitlement reaches an origin and the origin observes the same configured ADR-024 header/value pair used by RapidAPI; rotation evidence covers both gateways and both origins.
2. Missing, invalid, revoked, expired or over-limit Addressr keys are rejected at the gateway and do not reach an origin.
3. No Addressr server module imports or calls Clerk, Stripe, or direct-channel plan/account code; its default self-hosted configuration still runs with ADR-024's variables unset.
4. RapidAPI requests continue to reach both origins under their existing provider authentication after the direct channel launches.
5. Browser `Referer` or `Origin` alone cannot authorize a paid API request. The website demo and monitoring principals have separately configured routes, limits and usage classification.
6. Missing gateway secrets, durable-store bindings, account data, or origin configuration fail closed with a distinguishable operational error.
7. D1 contains no API-key plaintext and is authoritative for key hashes, organisation linkage, entitlement snapshots and idempotent usage events. Concurrent requests at a plan boundary cannot exceed a hard quota, and replaying the same usage event cannot bill it twice.
8. Tests distinguish abuse throttling from authoritative quota and usage accounting; no billing assertion is based on Cloudflare rate-limit counters.
9. A production-like benchmark records p50 and p95 added gateway latency, Worker CPU, storage operations and failure rate. Its accepted budget is documented before production activation; a result above that budget blocks activation.
10. Terraform plan and release evidence show an in-place update of the existing Worker and route, no parallel unmanaged gateway, and preserved two-origin configuration.

## Pros and Cons of the Options

### Expand the existing Worker

- Good, because it reuses the deployed edge, Terraform path and ADR-024 boundary.
- Bad, because the Worker becomes stateful and revenue-critical.

### Put billing in the server

- Good, because all request decisions would live in one process.
- Bad, because it couples the search product and self-hosted distribution to Addressr's hosted commercial system.

### Add a second gateway stack

- Good, because the demo proxy could remain unchanged.
- Bad, because it duplicates routes, secrets, deployment and monitoring without a demonstrated need.

### Keep RapidAPI only

- Good, because it adds no infrastructure.
- Bad, because it cannot deliver the Addressr-managed channel selected by ADR-061.

## Reassessment Criteria

Reassess if measured gateway latency breaches its accepted budget in two production periods, durable accounting cannot enforce quotas without materially degrading search, Cloudflare no longer supports required bindings through Terraform, per-caller origin accountability becomes necessary, or the website demo can be removed.

## Related

- [ADR-018 — Cloudflare Worker as API Key Proxy](018-cloudflare-worker-api-proxy.accepted.md) — remains in force until this proposal is ratified; this proposal would then supersede its proxy purpose.
- [ADR-032 — Cloudflare Worker deployed via Terraform](032-cloudflare-worker-terraform-deploy.proposed.md) — remains in force until this proposal is ratified; this proposal would then supersede it while retaining Terraform.
- [ADR-024 — Origin Gateway Auth Header Enforcement](024-origin-gateway-auth-header-enforcement.accepted.md) — remains the origin boundary and self-hosted compatibility mechanism.
- [ADR-061 — RapidAPI and Addressr-managed dual distribution](061-rapidapi-and-addressr-managed-dual-distribution.proposed.md) — requires both gateway paths to coexist.
- [ADR-063 — Organisation-owned identity and Stripe billing with RapidAPI-plan parity](063-organisation-owned-identity-and-stripe-billing-with-rapidapi-plan-parity.proposed.md) — supplies direct-channel entitlements and usage rules.
