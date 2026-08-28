---
status: 'proposed'
date: 2026-08-28
human-oversight: confirmed
oversight-date: 2026-08-28
decision-makers: [Tom Howard]
consulted: [wr-architect:agent]
informed: []
reassessment-date: 2026-11-28
supersedes: [017-rapidapi-distribution]
---

# RapidAPI and Addressr-managed dual distribution

## Context and Problem Statement

ADR-017 made RapidAPI the primary hosted API distribution channel because it supplied discovery, keys, limits, billing and onboarding without Addressr-owned commercial infrastructure. That choice also made API consumers RapidAPI's customers first and limited Addressr's control of the buyer journey.

Addressr now wants to sell the hosted API from `addressr.io` using its own accounts and Stripe billing, while continuing to offer RapidAPI. Existing RapidAPI subscribers must not be migrated, repriced or asked to replace their keys. Addressr also does not yet have evidence showing whether its customers originate on the website or in the RapidAPI marketplace.

## Decision Drivers

- Product and data owners should be able to discover, evaluate and buy the hosted API from Addressr.
- RapidAPI's marketplace discovery and existing customer relationships remain valuable.
- Existing subscribers must keep their current channel, keys, plan version and billing relationship.
- Permanent Addressr names should describe the product, not its relationship to RapidAPI.
- Channel performance must be measured without pretending that separately observed people are the same person.
- The change should be reversible one channel at a time.

## Considered Options

1. **Operate RapidAPI and an Addressr-managed channel in parallel (chosen).**
2. **Keep RapidAPI as the only commercial channel.**
3. **Replace RapidAPI and migrate its subscribers to Addressr.**

## Decision Outcome

Chosen option: **"Operate RapidAPI and an Addressr-managed channel in parallel."**

This decision supersedes ADR-017 in full.

RapidAPI remains an independently available sales and delivery channel. Addressr adds its own channel without migrating RapidAPI subscribers, keys, plans, usage or billing history. Neither channel is described as temporary or as the canonical source of the other's customer records.

The Addressr-managed API uses `api.addressr.io`. Account, organisation, API-key and billing journeys use `app.addressr.io`. Names such as `direct.addressr.io` are rejected because they encode a comparison with RapidAPI rather than a stable product responsibility.

Addressr records three separate acquisition measures:

1. outbound clicks from `addressr.io` to the RapidAPI listing;
2. new Addressr-managed subscriptions completed through Stripe; and
3. new RapidAPI subscriptions reported by RapidAPI.

These measures may be compared by reporting period, but they must not be joined into person-level attribution unless a future consented, reliable identifier exists in both channels.

## Consequences

### Good

- Addressr can own the complete website-to-first-request journey for its channel.
- RapidAPI discovery and existing subscriptions continue without forced change.
- `api.addressr.io` and `app.addressr.io` remain sensible if channel mix changes later.
- Separate measurements can show which channel creates customers without inventing cross-channel identity.

### Neutral

- Two commercial channels will have different account records, support paths and reporting surfaces.
- RapidAPI remains responsible for RapidAPI subscriber authentication, plan enforcement and billing.

### Bad

- Addressr must operate customer support, account security, billing and usage reconciliation for its own channel.
- Channel comparison will remain aggregate unless customers explicitly identify themselves across channels.
- Product copy and documentation must distinguish the two signup paths clearly.

## Confirmation

1. `addressr.io` offers both an Addressr-managed signup path and a clearly named RapidAPI marketplace path.
2. `api.addressr.io` serves the Addressr-managed API and `app.addressr.io` serves account and billing journeys; no public customer surface uses `direct.addressr.io`.
3. No migration job, shared key namespace or billing transfer modifies an existing RapidAPI subscriber.
4. A RapidAPI subscriber can continue making requests under the subscriber's existing RapidAPI plan and key after the Addressr-managed channel launches.
5. Reporting shows website-to-RapidAPI clicks, completed Addressr-managed subscriptions and new RapidAPI subscriptions as separate measures with a stated period and source.
6. No report claims person-level cross-channel attribution without a consented common identifier and a separately recorded decision.

## Pros and Cons of the Options

### Parallel channels

- Good, because it adds a first-party buyer journey without discarding marketplace discovery or disturbing existing subscribers.
- Bad, because Addressr operates and explains two commercial paths.

### RapidAPI only

- Good, because it retains the smallest operational surface.
- Bad, because Addressr still cannot own its primary buyer's complete journey or customer relationship.

### Replace RapidAPI and migrate subscribers

- Good, because it would leave one commercial system.
- Bad, because it creates unnecessary migration, repricing, support and trust risk and removes a useful acquisition channel.

## Reassessment Criteria

Reassess if either channel produces no new subscribers for two consecutive quarters, RapidAPI materially changes its terms or availability, operating two channels causes repeated customer confusion, or reliable consented cross-channel attribution becomes available.

## Related

- [ADR-017 — RapidAPI as the Primary API Distribution Channel](017-rapidapi-distribution.superseded.md) — superseded in full by this dual-channel decision.
- [ADR-062 — Hosted customer access enforced at the gateway](062-hosted-customer-access-enforced-at-the-gateway.proposed.md) — places direct-channel enforcement outside the search server.
- [ADR-066 — Clerk as the application identity provider](066-clerk-as-the-application-identity-provider.proposed.md) — supplies identity for the Addressr-managed channel.
- [ADR-068 — Stripe-hosted billing interactions](068-stripe-hosted-billing-interactions.proposed.md) — supplies checkout and billing self-service.
- [ADR-072 — RapidAPI catalogue parity at launch](072-rapidapi-catalogue-parity-at-launch.proposed.md) — keeps the launch offer comparable across channels.
