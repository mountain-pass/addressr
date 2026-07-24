---
status: proposed
rfc-id: rapidapi-listing-ci-sync
reported: 2026-07-19
human-oversight: unconfirmed
decision-makers: [Tom Howard]
problems: [P006]
adrs: [ADR-017, ADR-023]
jtbd: [JTBD-400, JTBD-001]
stories: []
---

# RFC-003: RapidAPI listing CI sync via OpenAPI Provisioning API

**Status**: proposed
**Reported**: 2026-07-19
**Problems**: P006
**ADRs**: ADR-023 (Supplementary OpenAPI Spec for v2 API with RapidAPI CI Sync), ADR-017 (RapidAPI Distribution)
**JTBD**: JTBD-400 (Ship releases reliably from trunk), JTBD-001 (Search and autocomplete addresses from input — affected persona surface)

## Summary

RapidAPI listing CI sync via the OpenAPI Provisioning REST API (`PUT /v1/apis/{apiId}`) — implement the deferred CI leg of ADR-023 so the marketplace listing stops drifting from the deployed API.

**Re-scoped 2026-07-24** from the GraphQL Platform API mutation: both the GraphQL Platform API and the REST Platform API are Enterprise-Hub-only (docs.rapidapi.com; user confirmed no subscribable hub listing), while the OpenAPI Provisioning endpoint P006 had recorded as defunct turned out to be live — only its hub listing page is gone.

## Driving problem trace

- **P006 (RapidAPI CI sync deferred — no working API)**: ADR-023's CI sync was never implemented because both original approaches failed — RapidAPI's OpenAPI Provisioning REST API is defunct (listing redirects to NOT_FOUND) and the official `RapidAPI/create_or_update_rapidapi_listing` GitHub Action has no tagged releases and a deprecated `node16` runtime. The listing drifts on every v2 endpoint change and requires a manual "Import from URL" in RapidAPI Studio per release.

## Scope

Sync the deployed OpenAPI spec to the RapidAPI listing via a direct `curl` REST call: `PUT https://openapi-provisioning.p.rapidapi.com/v1/apis/{apiId}` with the spec as a multipart `file` upload, authenticated by `X-RapidAPI-Key` only (same call shape as the third-party `vvatelot/rapidapi-openapi-github-action`; no owner ID and no GraphQL version-ID resolution needed). Endpoint verified live 2026-07-24 (HTTP 401 unauthenticated — auth-gated, not dead).

Staged implementation:

1. **Stage 1 (probe + manual sync)**: a `workflow_dispatch` workflow `.github/workflows/rapidapi-listing-sync.yml` with a `mode` input — `check` runs an auth probe (GET with the key, failing on 401/403), `sync` fetches the spec from `https://backend.addressr.io/api-docs` (the runtime endpoint ADR-023 already shipped) and PUTs it to the listing. GH secrets are write-only, so the first `check` run doubles as the key-viability probe.
2. **Stage 2 (post-sync verification)**: after the first successful `sync`, confirm in RapidAPI Studio that the listing's gateway configuration (backend URLs, round-robin, pricing tiers) survived the PUT — ADR-017's Confirmation criteria; the Provisioning API's PUT semantics on an existing listing are otherwise unverified.
3. **Stage 3 (release wiring)**: add the sync step to `release.yml` after deploy + smoke tests. ADR-023's Confirmation is only fully satisfied at this stage.
4. **Fail-loud** throughout: spec-upload failure fails the pipeline (but does not roll back the deploy), per ADR-023's Confirmation criterion. No silent soft-fail.

**Prerequisites** (satisfied 2026-07-24): `RAPIDAPI_KEY` GitHub Actions secret provisioned (1Password → GH secrets flow); listing API ID `api_5f12dd58-ab01-419e-8c9b-91d19208d16a` supplied from the Studio URL (public identifier — plain env var, not a secret). `RAPIDAPI_OWNER_ID` is not needed on this path. Open question the Stage 1 probe answers: whether a regular provider key clears the endpoint's auth, or whether it demanded a subscription to the now-delisted listing (in which case fall back to manual sync / RapidAPI support).

## Stories

`stories: []` — back-fill at the `/wr-itil:manage-rfc accepted` transition per ADR-089. Story decomposition is deferred because (a) implementation is blocked on the user-side prerequisites above, so the story appetite cannot be set until the key scope is confirmed, and (b) this RFC was auto-created mid-AFK-iteration by the I13 fix-time gate, where story capture is out of scope.

## Commits

(rendered from `git log --grep "Refs: RFC-003"` by `/wr-itil:manage-rfc` + `wr-itil-reconcile-rfcs` per ADR-085 — a git-log-derived view, not stored per-commit. At capture there are no commits yet.)

## Related

- [P006: RapidAPI CI sync deferred](../problems/known-error/006-rapidapi-ci-sync-deferred.md) — driving Known Error
- [ADR 023: OpenAPI Spec RapidAPI CI Sync](../decisions/023-openapi-spec-rapidapi-ci-sync.proposed.md) — ratified decision this RFC implements; update its Implementation Notes when the sync ships
- [ADR 017: RapidAPI Distribution](../decisions/017-rapidapi-distribution.accepted.md)
- Single-commit grain per wr-itil ADR-014 (framework decision — distinct from addressr's own ADR 014, ESLint 9 Flat Configuration)
