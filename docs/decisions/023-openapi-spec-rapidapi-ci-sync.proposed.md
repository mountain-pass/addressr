---
status: 'proposed'
date: 2026-04-14
decision-makers: [Tom Howard]
consulted: []
informed: []
reassessment-date: 2026-07-14
---

# ADR 023: Supplementary OpenAPI Spec for v2 API with RapidAPI CI Sync

## Context and Problem Statement

The v2 HATEOAS API (ADR 012) is self-describing via link relations — clients navigate by following links, not by reading a spec. However, RapidAPI (the primary distribution channel, ADR 017) requires endpoint definitions to display on its marketplace. These are currently managed manually via the RapidAPI dashboard, which drifts out of sync whenever endpoints are added or modified.

With the addition of locality, postcode, and state endpoints (v2.1.0), manually maintaining RapidAPI definitions is no longer practical. A decision is needed on how to keep the RapidAPI listing accurate.

## Decision Drivers

- RapidAPI marketplace requires endpoint definitions for developer discovery (ADR 017)
- Manual RapidAPI management is error-prone and drifts from the actual API
- The HATEOAS API remains the authoritative contract (ADR 012) — any spec is supplementary
- The spec must stay in sync with waycharter-server.js without manual intervention
- RapidAPI supports OpenAPI import for bulk endpoint definition

## Considered Options

1. **Runtime /api-docs endpoint with CI sync to RapidAPI** — auto-generate the OpenAPI spec from WayCharter's registered routes at runtime, CI fetches from deployed instance and uploads to RapidAPI
2. **Static OpenAPI spec file in repo with CI sync** — maintain a hand-written spec file, upload to RapidAPI via CI
3. **Manual RapidAPI management** — continue managing endpoint definitions by hand in the RapidAPI dashboard
4. **No spec, rely on HATEOAS self-description only** — let clients discover the API via link relations

## Decision Outcome

**Option 1: Runtime /api-docs endpoint with CI sync**, because the spec is derived from the same WayCharter route registrations that serve the API, eliminating any possibility of drift. CI fetches the spec from the live deployed instance after smoke tests pass, then uploads to RapidAPI. The HATEOAS link-driven API (ADR 012) remains the authoritative contract.

### Consequences

#### Good

- Zero spec drift — the OpenAPI spec is generated from the same code that serves the API
- RapidAPI listing stays accurate automatically after each deploy
- Developers on RapidAPI see correct endpoint definitions, parameters, and schemas
- The /api-docs endpoint is also useful for self-hosted users and tooling
- No manual maintenance when endpoints change

#### Neutral

- Two representations exist (HATEOAS links + OpenAPI spec), but both are generated from the same route registrations
- Adds a /api-docs endpoint to the API surface

#### Bad

- Adds a new CI step and a new secret (RapidAPI management API key)
- Spec upload failure after deploy leaves RapidAPI temporarily out of sync (deploy is not rolled back)
- OpenAPI cannot fully express HATEOAS link relations — the spec is an approximation of the navigable API

### Confirmation

- GET /api-docs returns a valid OpenAPI 3.x JSON spec derived from WayCharter routes
- The CI release workflow fetches /api-docs from the deployed instance and uploads to RapidAPI
- Spec upload failure fails the pipeline (but does not roll back the deploy)
- The spec's info.description notes it is supplementary to the HATEOAS API

## Pros and Cons of the Options

### Option 1: Runtime /api-docs endpoint with CI sync

- Good: Zero drift — spec generated from live route registrations
- Good: Eliminates all manual maintenance
- Good: Useful for self-hosted users and tooling beyond RapidAPI
- Bad: New CI dependency (RapidAPI API + deployed instance availability)
- Bad: OpenAPI cannot fully express HATEOAS link relations

### Option 2: Static OpenAPI spec file in repo

- Good: Spec is version-controlled and reviewable in PRs
- Good: No runtime overhead
- Bad: Drifts from actual API when waycharter-server.js changes without spec update
- Bad: Manual maintenance for every endpoint change

### Option 3: Manual RapidAPI management

- Good: No new files or CI changes
- Bad: Already proven to drift with v2.1.0 endpoint additions
- Bad: Manual effort for every endpoint change

### Option 4: No spec, HATEOAS only

- Good: Single source of truth
- Bad: Incompatible with RapidAPI marketplace which requires endpoint definitions
- Bad: Developers cannot discover endpoints before making API calls

## Reassessment Criteria

- RapidAPI publishes a supported, stable management API for spec uploads
- RapidAPI adds support for auto-discovering HATEOAS endpoints
- WayCharter adds native OpenAPI spec generation (replacing custom /api-docs implementation)
- The /api-docs endpoint causes performance or security concerns

## Implementation Notes

**2026-04-15: CI sync deferred.** The `/api-docs` endpoint is live at `https://backend.addressr.io/api-docs`, but automated CI sync to RapidAPI is not yet implemented. Two approaches were attempted and both failed:

1. **RapidAPI OpenAPI Provisioning REST API** (`openapi-provisioning.p.rapidapi.com`) — the listing is defunct (returns NOT_FOUND on RapidAPI).
2. **`RapidAPI/create_or_update_rapidapi_listing` GitHub Action** — the repository has no tagged releases, only a `main` branch, so `@v0` and other version references fail to resolve.

**Interim workflow:** When v2 endpoints change, manually use RapidAPI Studio's "Import from URL" feature pointing at `https://backend.addressr.io/api-docs`. This preserves the core value of the decision (accurate RapidAPI listing) without the automation.

**Follow-up:** Investigate the current RapidAPI Platform GraphQL API directly, or pin the GitHub Action to a specific `main` commit SHA once it is confirmed working.
