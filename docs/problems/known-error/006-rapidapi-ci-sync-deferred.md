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

- **RapidAPI OpenAPI Provisioning REST API** (`openapi-provisioning.p.rapidapi.com`) — ~~the listing is defunct~~ **CORRECTED 2026-07-24**: only the hub _listing page_ is gone (`https://rapidapi.com/rapidapi3-rapidapi-tools/api/openapi-provisioning` redirects to NOT_FOUND); the endpoint itself is live — unauthenticated `GET /v1/apis/...` returns HTTP 401 (auth-gated, not dead). The original "defunct" conclusion over-read the listing-page 404.
- **GraphQL Platform API and REST Platform API are Enterprise-Hub-only** (2026-07-24): docs.rapidapi.com describes both as Enterprise features, and the user confirmed no subscribable "GraphQL Platform" listing exists in the hub for the addressr account. Fix Strategy option 2 (GraphQL-direct) and the official `create_or_update_rapidapi_listing` action (which calls the same GraphQL API) are therefore unavailable to non-Enterprise providers — option 1 (SHA-pin) falls with it.
- **`RapidAPI/create_or_update_rapidapi_listing` GitHub Action** — the repository exists but has no tagged versions or releases, only a `main` branch. Reference `@v0` fails to resolve in the workflow runner
- Both attempts documented in ADR 023 Implementation Notes

### Investigation Tasks

- [x] Try REST Provisioning API — defunct
- [x] Try official GitHub Action — no tagged versions
- [x] Investigate direct GraphQL calls to `platform-graphql.p.rapidapi.com` — **endpoint is live**. Probed 2026-04-19: `GET https://platform-graphql.p.rapidapi.com/` returns 401 (auth required), `POST` with a GraphQL introspection query returns 429 (rate-limited without a key). Confirms the GraphQL-direct path is viable if a key with the correct scope is obtained.
- [x] Check if pinning the Action to a `main` commit SHA works — the repo's `main` HEAD is `4590a109931fe324ceaa8144b8d9f58df226a7b3` (last commit 2023-04-17, no activity since). `action.yml` uses `using: node16`, which GitHub Actions now emits a deprecation warning for and will eventually remove. **SHA-pin is feasible short-term** but carries deprecation risk — the GraphQL-direct path (option 2 in Fix Strategy) is more durable.
- [x] Confirm which RapidAPI key scope is needed — **overtaken by re-scope (2026-07-24)**: the GraphQL Platform API subscription is impossible for non-Enterprise accounts, so the question moved to the Provisioning REST path. `RAPIDAPI_KEY` (the account's app key) provisioned as a GH secret 2026-07-24; whether it clears the provisioning endpoint's auth is answered by the `rapidapi-listing-sync.yml` `check` dispatch (RFC-003 Stage 1).
- [x] Action inputs catalogued (from `action.yml` at SHA `4590a10`): `owner_id`, `x_rapidapi_key`, `x_rapidapi_identity_key` (optional), `x_rapidapi_graphql_host`, `spec_path`, `graphql_url`. Outputs: `api_id`, `api_version_name`, `api_version_id`.
- [x] Stage 1 auth probe run (2026-07-24, `rapidapi-listing-sync.yml` dispatch, run 30073575597): `GET /v1/apis/{apiId}` with `RAPIDAPI_KEY` returned **HTTP 403 "You are not subscribed to this API"**. Key is valid (not 401); the account lacks a subscription to the Provisioning API, and its delisted hub page leaves no self-serve subscribe path. All programmatic routes are now confirmed closed for non-Enterprise accounts without RapidAPI intervention.
- [ ] RapidAPI support request (user decision 2026-07-24): ask support to enable/subscribe the account to the OpenAPI Provisioning API (or name the supported non-Enterprise path for programmatic spec updates). **Blocked on upstream response.** The sync workflow stays in place — it works the moment the subscription is enabled.

## Fix Strategy (proposed)

Fix vehicle: [RFC-003 (RapidAPI listing CI sync via OpenAPI Provisioning API)](../../rfcs/RFC-003-rapidapi-listing-ci-sync.proposed.md) — auto-created 2026-07-19 by the I13 fix-time gate; **re-scoped 2026-07-24** after both original options proved Enterprise-gated (see Investigation Findings).

Current strategy (RFC-003 staged plan): direct `curl` `PUT https://openapi-provisioning.p.rapidapi.com/v1/apis/{apiId}` uploading the spec fetched from `https://backend.addressr.io/api-docs`, authenticated by `X-RapidAPI-Key` alone. Staging: `workflow_dispatch` probe/manual-sync workflow first (`rapidapi-listing-sync.yml`), Studio verification of listing gateway/pricing config after the first sync (ADR-017 Confirmation), then `release.yml` wiring (ADR-023 Confirmation).

Unblocked 2026-07-24: `RAPIDAPI_KEY` secret provisioned; listing API ID `api_5f12dd58-ab01-419e-8c9b-91d19208d16a` supplied (public identifier). `RAPIDAPI_OWNER_ID` not needed on this path. Superseded options (both Enterprise-gated, kept for the record): SHA-pinning `RapidAPI/create_or_update_rapidapi_listing`, and the GraphQL `updateApisFromRapidOas` mutation.

## Related

- [ADR 023: OpenAPI Spec RapidAPI CI Sync](../decisions/023-openapi-spec-rapidapi-ci-sync.proposed.md)
- [ADR 017: RapidAPI Distribution](../decisions/017-rapidapi-distribution.accepted.md)

## RFCs

| RFC     | Status   | Title                                                 |
| ------- | -------- | ----------------------------------------------------- |
| RFC-003 | proposed | RapidAPI listing CI sync via OpenAPI Provisioning API |
