# Problem 006: RapidAPI CI sync deferred — no working API

**Status**: Open
**Reported**: 2026-04-15
**Priority**: 6 (Medium) — Impact: Moderate (3) x Likelihood: Possible (2)

## Description

ADR 023 specifies that the OpenAPI spec should auto-sync to RapidAPI after each deploy. The implementation is currently blocked because both attempted approaches failed.

## Symptoms

- RapidAPI listing drifts from the deployed API whenever v2 endpoints are added or modified
- Manual intervention required to keep RapidAPI in sync (Import from URL in Studio)
- ADR 023 Confirmation criteria are not fully satisfied — the CI release workflow does not yet fetch and upload the spec

## Workaround

When v2 endpoints change, manually use RapidAPI Studio's "Import from URL" feature pointing at `https://backend.addressr.io/api-docs`. This produces correct results but requires human action per release.

## Impact Assessment

- **Who is affected**: Web/App Developer persona (discovering the API on RapidAPI)
- **Frequency**: Every v2 API change. Low cadence but drift accumulates without manual sync
- **Severity**: Medium — does not affect the running service, only marketplace documentation accuracy
- **Analytics**: N/A

## Root Cause Analysis

### Investigation Findings

- **RapidAPI OpenAPI Provisioning REST API** (`openapi-provisioning.p.rapidapi.com`) — the listing is defunct. URL `https://rapidapi.com/rapidapi3-rapidapi-tools/api/openapi-provisioning` redirects to NOT_FOUND
- **`RapidAPI/create_or_update_rapidapi_listing` GitHub Action** — the repository exists but has no tagged versions or releases, only a `main` branch. Reference `@v0` fails to resolve in the workflow runner
- Both attempts documented in ADR 023 Implementation Notes

### Investigation Tasks

- [x] Try REST Provisioning API — defunct
- [x] Try official GitHub Action — no tagged versions
- [ ] Investigate direct GraphQL calls to `platform-graphql.p.rapidapi.com`
- [ ] Check if pinning the Action to a `main` commit SHA works
- [ ] Confirm which RapidAPI key scope is needed (the subscribed `X-RapidAPI-Key` vs a separate management key)

## Fix Strategy (proposed)

Either:

1. Pin `RapidAPI/create_or_update_rapidapi_listing` to a specific commit SHA from `main` once tested, OR
2. Implement a direct `curl` call to the GraphQL Platform API with the `updateApisFromRapidOas` mutation

Both require:

- `RAPIDAPI_OWNER_ID` and `RAPIDAPI_KEY` GitHub secrets
- Subscribe to the GraphQL Platform API on RapidAPI
- Obtain the API Version ID (not just the API ID) via a GraphQL query

## Related

- [ADR 023: OpenAPI Spec RapidAPI CI Sync](../decisions/023-openapi-spec-rapidapi-ci-sync.proposed.md)
- [ADR 017: RapidAPI Distribution](../decisions/017-rapidapi-distribution.accepted.md)
