---
status: proposed
rfc-id: rapidapi-listing-ci-sync-graphql-platform-api
reported: 2026-07-19
human-oversight: unconfirmed
decision-makers: [Tom Howard]
problems: [P006]
adrs: [ADR-017, ADR-023]
jtbd: [JTBD-400, JTBD-001]
stories: []
---

# RFC-003: RapidAPI listing CI sync via GraphQL Platform API

**Status**: proposed
**Reported**: 2026-07-19
**Problems**: P006
**ADRs**: ADR-023 (Supplementary OpenAPI Spec for v2 API with RapidAPI CI Sync), ADR-017 (RapidAPI Distribution)
**JTBD**: JTBD-400 (Ship releases reliably from trunk), JTBD-001 (Search and autocomplete addresses from input — affected persona surface)

## Summary

RapidAPI listing CI sync via GraphQL Platform API (`updateApisFromRapidOas`) — implement the deferred CI leg of ADR-023 so the marketplace listing stops drifting from the deployed API.

## Driving problem trace

- **P006 (RapidAPI CI sync deferred — no working API)**: ADR-023's CI sync was never implemented because both original approaches failed — RapidAPI's OpenAPI Provisioning REST API is defunct (listing redirects to NOT_FOUND) and the official `RapidAPI/create_or_update_rapidapi_listing` GitHub Action has no tagged releases and a deprecated `node16` runtime. The listing drifts on every v2 endpoint change and requires a manual "Import from URL" in RapidAPI Studio per release.

## Scope

Add a release-workflow step that syncs the deployed OpenAPI spec to the RapidAPI listing via a direct `curl` GraphQL call to `https://platform-graphql.p.rapidapi.com/` using the `updateApisFromRapidOas` mutation. This is P006's Fix Strategy option 2, the path ADR-023's Implementation Notes already point at — the SHA-pinned GitHub Action alternative is short-term-only (dormant repo, deprecated `node16` runtime). The endpoint was verified live by the 2026-04-19 probe (401 unauthenticated GET, 429 rate-limited unauthenticated POST).

Implementation shape:

1. After deploy + smoke tests pass, CI fetches the spec from `https://backend.addressr.io/api-docs` (the runtime endpoint ADR-023 already shipped).
2. A GraphQL query resolves the API Version ID (not just the API ID) for the addressr listing.
3. The `updateApisFromRapidOas` mutation uploads the fetched spec against that version.
4. **Fail-loud**: spec-upload failure fails the pipeline (but does not roll back the deploy), per ADR-023's Confirmation criterion. No silent soft-fail.

**Blocking user-side prerequisites** (implementation cannot start or be verified until these land):

- Subscribe to the GraphQL Platform API on RapidAPI (account-level action — only the account owner can do this).
- Provision `RAPIDAPI_OWNER_ID` and `RAPIDAPI_KEY` GitHub Actions secrets (1Password → GH secrets flow). Verified absent 2026-07-19 via `gh secret list` — only the unrelated `TF_VAR_CLOUDFLARE_RAPIDAPI_KEY` exists.
- Confirm which key scope the mutation needs (subscribed `X-RapidAPI-Key` vs a separate management key) — P006 investigation task, blocked on the subscription above.

## Stories

`stories: []` — back-fill at the `/wr-itil:manage-rfc accepted` transition per ADR-089. Story decomposition is deferred because (a) implementation is blocked on the user-side prerequisites above, so the story appetite cannot be set until the key scope is confirmed, and (b) this RFC was auto-created mid-AFK-iteration by the I13 fix-time gate, where story capture is out of scope.

## Commits

(rendered from `git log --grep "Refs: RFC-003"` by `/wr-itil:manage-rfc` + `wr-itil-reconcile-rfcs` per ADR-085 — a git-log-derived view, not stored per-commit. At capture there are no commits yet.)

## Related

- [P006: RapidAPI CI sync deferred](../problems/known-error/006-rapidapi-ci-sync-deferred.md) — driving Known Error
- [ADR 023: OpenAPI Spec RapidAPI CI Sync](../decisions/023-openapi-spec-rapidapi-ci-sync.proposed.md) — ratified decision this RFC implements; update its Implementation Notes when the sync ships
- [ADR 017: RapidAPI Distribution](../decisions/017-rapidapi-distribution.accepted.md)
- Single-commit grain per wr-itil ADR-014 (framework decision — distinct from addressr's own ADR 014, ESLint 9 Flat Configuration)
