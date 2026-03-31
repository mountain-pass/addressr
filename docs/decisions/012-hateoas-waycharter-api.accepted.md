---
status: accepted
date: 2022-01-01
decision-makers: [Tom Howard]
consulted: []
informed: []
---

# ADR 012: HATEOAS API Design with WayCharter/WayChaser

## Context and Problem Statement

The v2 API needs an architectural pattern that makes the API self-describing and navigable by clients without hardcoded URL knowledge.

## Decision Drivers

- API discoverability without out-of-band documentation
- Client-server decoupling via link relations
- Mountain Pass's own HATEOAS libraries available
- REST maturity level 3 (Richardson model)

## Considered Options

1. **HATEOAS with WayCharter** -- server-side link generation with custom link relations
2. **Traditional REST with OpenAPI spec** -- URL patterns documented in Swagger (the v1 approach)
3. **GraphQL** -- query-based API with schema introspection

## Decision Outcome

**Option 1: HATEOAS with WayCharter.** The v2 API returns link relations (`self`, `next`, `prev`, `first`, `item`, `canonical`, `https://addressr.io/rels/address-search`) and URI templates. Clients navigate by following links.

Server: `@mountainpass/waycharter` with `registerCollection` and `registerResourceType` patterns. Client (testing): `@mountainpass/waychaser` navigates via `waychaser.load()`.

### Consequences

- Good: API is self-describing and discoverable
- Good: Clients don't need to construct URLs
- Good: Cache-control headers on all responses (max-age 1 week)
- Bad: Tight coupling to Mountain Pass's own libraries
- Bad: HATEOAS is less familiar to most API consumers

### Confirmation

- `src/waycharterServer.js` implements collection/item patterns with link relations
- `test/resources/features/addressv2.feature` tests assert on link relations
- `test/js/drivers/AddressrRest2Driver.js` uses waychaser for navigation

### Reassessment Criteria

- WayCharter/WayChaser library maintenance burden
- Client adoption challenges with HATEOAS
- Performance overhead of link resolution
