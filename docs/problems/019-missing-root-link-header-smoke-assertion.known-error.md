# Problem 019: No deploy-time smoke check for root `Link` header rel completeness

**Status**: Known Error
**Reported**: 2026-04-18
**Priority**: 6 (Medium) — Impact: Minor (2) x Likelihood: Possible (3)

## Description

The release smoke test in `.github/workflows/release.yml` (step "Smoke test production") hits `https://backend.addressr.io/` (line 159) but only checks that the response is 200. It does not assert that the advertised `Link` header includes the expected rels for the deployed version. The local cucumber test at `test/resources/features/addressv2.feature` asserts the rel list but runs pre-deploy against a local server, not post-deploy against production.

Result: drift between the advertised contract (root `Link` header) and the deployed code is only detected when a customer reports a bug (see P017, reported 3 days after the stale cache first appeared). The smoke test that runs 2 minutes after every deploy could assert completeness at zero extra cost.

## Symptoms

- Releases that change the root rel set pass the smoke test even when CF edges serve stale responses elsewhere in the request path.
- Consumers are the first detector of rel-drift in production.
- No CI signal correlates rel advertisement with release timing.

## Workaround

- None today. The existing cucumber tests catch code-level regressions but not deployed-state regressions.

## Impact Assessment

- **Who is affected**: Addressr maintainers (diagnostic loop); downstream consumers whose complaints are the first observability signal. Persona: Addressr Contributor / Maintainer (J7 — "maintainable coverage").
- **Frequency**: Currently zero CI signal for this class of drift. Gap applies to every release.
- **Severity**: Minor — observability gap, not a user-visible bug in itself. Fixing it shortens the diagnostic loop for problems like P017.
- **Analytics**: N/A.

## Root Cause Analysis

### Finding

`release.yml` "Smoke test production" at line 151 runs `curl -sf https://backend.addressr.io/` with no header inspection. It also runs a ranking probe for `/addresses?q=...` (lines 179-197) but nothing for the root's `Link` header.

### Fix Strategy (proposed)

Add a post-deploy smoke assertion that the root `Link` header contains each of the rels registered in `src/waycharter-server.js`. Two shapes:

1. **Simple curl + grep** — list expected rel URIs in the workflow and fail the job if any is absent from the `link:` response header. Runs on both `backend.addressr.io/` and `addressr.p.rapidapi.com/` (the RapidAPI-fronted probe is what would have caught P017).
2. **Dedicated `node --test` script** — parse the `Link` header with `http-link-header` and diff against a declared rel set. More robust but requires a test runner inside the release job. Overlaps with P020 (orphan test runner wiring).

For the RapidAPI probe: cache-bust with `?cachebust=$(date +%s)` so we assert on a fresh origin fetch, not a cached edge response. The probe verifies the deployed code's advertisement; a separate monitor could check the cached edge lag (not in scope here).

## Investigation Tasks

- [x] Decide curl-+-grep vs node-test approach — went with curl+grep per fix-strategy Option 1.
- [x] Inventory the canonical rel set — pulled from `test/resources/features/addressv2.feature:8-15`.
- [x] Add the probe step(s) to `.github/workflows/release.yml` — appended within the existing "Smoke test production" step, after the ADR 024 auth_header is set up.
- [ ] Decide on RapidAPI probe inclusion — **Deferred**: no `X-RapidAPI-Key` secret in release.yml, adding one expands scope. Origin-only probe lands first; the gateway probe can be a later follow-up if stale-cache (P017) recurs.
- [x] Add a failing test or a dry-run of the probe against current master to confirm it passes before relying on it in CI — dry-ran the bash probe logic locally: PASS when all 6 rels present, FAIL loudly with actionable error when any is missing.

## Fix Released

**Date**: 2026-04-19

Appended a curl+grep rel-completeness probe to the existing "Smoke test production" step in `.github/workflows/release.yml`. The probe uses the ADR 024 auth_header (same one the ranking probes use) to GET root `/`, captures the `Link` response header, and fails the job with an explicit "missing rel" message if any of the 6 expected rels is absent.

Expected rels list (per `test/resources/features/addressv2.feature:10-15`):

- `https://addressr.io/rels/address-search`
- `https://addressr.io/rels/locality-search`
- `https://addressr.io/rels/postcode-search`
- `https://addressr.io/rels/state-search`
- `https://addressr.io/rels/api-docs`
- `https://addressr.io/rels/health`

**Also fixed** (architect-recommended): the pre-existing `curl -sf https://backend.addressr.io/` at line 159 was latently broken — root `/` requires ADR 024 proxy-auth, and that line did not send the auth header. Removed it; the new P019 probe subsumes it (same target, asserts more than 2xx).

**Verification path**: The next release that actually publishes a new version (i.e., triggers `steps.changesets.outputs.published == 'true'`) will run this probe. If the origin drops any rel, the release job fails with a clear "root Link header missing rel: <uri>" message.

**Out of scope**: RapidAPI-gateway-fronted probe. Would have caught P017 (stale cache) but requires an `X-RapidAPI-Key` secret in the release job that is not currently provisioned.

## Related

- [P017: RapidAPI root missing postcode/locality/state rels](017-rapidapi-root-missing-postcode-locality-state-rels.closed.md) — the motivator.
- [P018: Root `/` cache TTL too long for a version-gated HATEOAS contract](018-root-cache-ttl-too-long-for-versioned-contract.open.md) — complementary propagation fix.
- [P020: Orphan `test/js/*.test.js` — no script runs them](020-orphan-node-test-files.open.md) — if we pick the node-test approach for the smoke probe.
- `.github/workflows/release.yml:151-199` — the smoke-test block to extend.
- ADR 023: OpenAPI spec RapidAPI CI sync — related marketplace-drift concern.
