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

# Hosted customer access enforced at the gateway

## Context and Problem Statement

The Addressr-managed channel needs customer authentication and entitlement enforcement. Putting those commercial concerns in the search server would couple the reusable server and self-hosted distribution to Addressr's hosted business model. ADR-024 already defines an optional, gateway-agnostic origin-secret boundary.

## Decision Drivers

- Keep the search server independent of hosted accounts and billing.
- Reject unauthorized hosted requests before they reach an origin.
- Preserve ADR-024's default-off self-hosted behaviour.
- Keep RapidAPI and the Addressr-managed channel on the same origins.

## Considered Options

1. **Enforce hosted customer access at the gateway (chosen).**
2. **Enforce customer access inside the search server.**
3. **Keep RapidAPI as the only enforcement boundary.**

## Decision Outcome

Chosen option: **"Enforce hosted customer access at the gateway."**

The Addressr-managed gateway authenticates customer requests and checks locally projected entitlement before forwarding. It injects the same configured header/value pair that RapidAPI uses under ADR-024. The origin authenticates a trusted gateway, not an individual customer or distribution channel.

The search server contains no Addressr-hosted customer, identity-provider, billing-provider, plan, or API-key logic. Self-hosted deployments remain unchanged when ADR-024's variables are unset.

## Consequences

### Good

- Hosted commercial concerns stay outside the reusable search product.
- Unauthorized traffic is rejected before consuming origin capacity.
- Both commercial channels can share the existing origins.

### Neutral

- ADR-024 remains the origin boundary and does not provide per-customer identity.

### Bad

- The hosted gateway becomes a revenue-critical enforcement boundary.
- Gateway failure can interrupt the Addressr-managed channel while the origin remains healthy.

## Confirmation

1. Missing, invalid, revoked or unentitled Addressr credentials are rejected at the gateway and do not reach an origin.
2. A valid entitled request reaches an origin with the configured ADR-024 header/value pair.
3. Both gateways and both origins participate in shared-secret rotation evidence.
4. No search-server module imports or calls direct-channel customer, identity, billing, plan or API-key code.
5. The default self-hosted server still runs with ADR-024's variables unset.
6. Missing gateway secret, entitlement data or origin configuration fails closed with a distinguishable operational error.
7. Production activation remains blocked until a separate numeric gateway performance-budget ADR is ratified.

## Pros and Cons of the Options

### Gateway enforcement

- Good, because it isolates hosted commercial policy at the hosted boundary.
- Bad, because the gateway becomes stateful and load-bearing.

### Search-server enforcement

- Good, because authorization would live beside request handling.
- Bad, because it couples every distribution to one hosted business model.

### RapidAPI-only enforcement

- Good, because it adds no new boundary.
- Bad, because it cannot provide the Addressr-managed channel selected by ADR-061.

## Reassessment Criteria

Reassess if self-hosted operators require the same customer-account model, the origin needs per-customer audit identity, or the gateway cannot enforce entitlement within an accepted performance budget.

## Related

- [ADR-024 — Origin Gateway Auth Header Enforcement](024-origin-gateway-auth-header-enforcement.accepted.md)
- [ADR-061 — RapidAPI and Addressr-managed dual distribution](061-rapidapi-and-addressr-managed-dual-distribution.proposed.md)
- [ADR-063 — Existing Cloudflare Worker extended for the managed API](063-existing-cloudflare-worker-extended-for-the-managed-api.proposed.md)
- [ADR-069 — Stripe state projected through signed webhooks](069-stripe-state-projected-through-signed-webhooks.proposed.md)
- [ADR-073 — Managed gateway routes directly to the origins](073-managed-gateway-routes-directly-to-the-origins.proposed.md)
