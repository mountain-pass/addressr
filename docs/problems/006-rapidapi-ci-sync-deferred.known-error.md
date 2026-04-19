# Problem 006: RapidAPI CI sync deferred — no working API

**Status**: Known Error
**Reported**: 2026-04-15
**Priority**: 9 (Medium) — Impact: Moderate (3) x Likelihood: Possible (3)

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
- [x] Investigate direct GraphQL calls to `platform-graphql.p.rapidapi.com` — **endpoint is live**. Probed 2026-04-19: `GET https://platform-graphql.p.rapidapi.com/` returns 401 (auth required), `POST` with a GraphQL introspection query returns 429 (rate-limited without a key). Confirms the GraphQL-direct path is viable if a key with the correct scope is obtained.
- [x] Check if pinning the Action to a `main` commit SHA works — the repo's `main` HEAD is `4590a109931fe324ceaa8144b8d9f58df226a7b3` (last commit 2023-04-17, no activity since). `action.yml` uses `using: node16`, which GitHub Actions now emits a deprecation warning for and will eventually remove. **SHA-pin is feasible short-term** but carries deprecation risk — the GraphQL-direct path (option 2 in Fix Strategy) is more durable.
- [ ] Confirm which RapidAPI key scope is needed (the subscribed `X-RapidAPI-Key` vs a separate management key) — **blocked on user**: requires subscribing to the GraphQL Platform API on RapidAPI, which is an account-level action.
- [x] Action inputs catalogued (from `action.yml` at SHA `4590a10`): `owner_id`, `x_rapidapi_key`, `x_rapidapi_identity_key` (optional), `x_rapidapi_graphql_host`, `spec_path`, `graphql_url`. Outputs: `api_id`, `api_version_name`, `api_version_id`.

## Fix Strategy (proposed)

Either:

1. Pin `RapidAPI/create_or_update_rapidapi_listing` to SHA `4590a109931fe324ceaa8144b8d9f58df226a7b3` (current `main` HEAD, dormant since 2023-04-17). **Short-term only** — the action uses `node16`, which GitHub Actions has deprecated and will remove.
2. Implement a direct `curl` call to the GraphQL Platform API with the `updateApisFromRapidOas` mutation. Endpoint verified live at `https://platform-graphql.p.rapidapi.com/` (2026-04-19 probe). **Preferred** — no deprecated runtime dependency.

Both require:

- `RAPIDAPI_OWNER_ID` and `RAPIDAPI_KEY` GitHub secrets
- Subscribe to the GraphQL Platform API on RapidAPI
- Obtain the API Version ID (not just the API ID) via a GraphQL query

## Related

- [ADR 023: OpenAPI Spec RapidAPI CI Sync](../decisions/023-openapi-spec-rapidapi-ci-sync.proposed.md)
- [ADR 017: RapidAPI Distribution](../decisions/017-rapidapi-distribution.accepted.md)
