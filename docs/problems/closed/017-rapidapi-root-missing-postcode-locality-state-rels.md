# Problem 017: HATEOAS root missing postcode/locality/state search rels on RapidAPI

**Status**: Closed
**Reported**: 2026-04-17
**Closed**: 2026-04-17
**Priority**: 15 (High) — Impact: Significant (4) x Likelihood: Almost certain (5)

## Resolution

**Root cause: stale RapidAPI edge cache.** Diagnosis completed 2026-04-17. Evidence:

| Path                                                      | etag      | age                   | cf-cache-status    | rels in Link    |
| --------------------------------------------------------- | --------- | --------------------- | ------------------ | --------------- |
| `backend.addressr.io/` (Mountain Pass CF, via proxy-auth) | `"2.2.0"` | fresh                 | HIT/MISS (current) | all 7 (correct) |
| `addressr.p.rapidapi.com/` (RapidAPI CF)                  | `"2.0.4"` | ~268,787s (~3.1 days) | HIT                | 3 (stale)       |
| `addressr.p.rapidapi.com/?cachebust=…` (bypass edge)      | `"2.2.0"` | fresh                 | DYNAMIC            | all 7 (correct) |

The RapidAPI edge cached a v2.0.4 response for `GET /` ~3 days ago. Our origin sets `cache-control: public, max-age=604800` (7 days) at `src/waycharter-server.js:919`, which CF honors. Every subsequent deploy (v2.1.0 → v2.2.0) added rels at the origin but the cached response predates them and won't naturally expire for ~4 more days.

Our own Cloudflare zone in front of `backend.addressr.io` is serving the fresh v2.2.0 response correctly, so the bug is isolated to RapidAPI's edge.

**Closed without shipping a fix** at user direction. The stale RapidAPI CF entry will expire naturally within ~4 days. Consumers needing the new rels sooner can use direct path access (`/postcodes?q=`, `/localities?q=`, `/states?q=`) — those endpoints are live on the backend and reachable via RapidAPI using the documented paths; only HATEOAS root discovery is affected.

**Investigation notes** (for future reference, not action items):

- RapidAPI does not document a client-bypass header, a `PURGE` endpoint, or any provider-side gateway cache invalidation. See `gateway-configuration` and `api-caching-with-http-headers` — no cache control section.
- Query-string cache-busting works because CF includes the query in the cache key.
- A future permanent fix candidate: lower `cache-control` max-age on the root `/` from 7 days to a short value (e.g. 60s + `must-revalidate`). Would flush both our CF and RapidAPI's CF within ~60s of every deploy. Not shipped in this ticket — would be a fresh problem if the issue recurs after the natural expiry.

**Reopen trigger**: the same symptom observed against `addressr.p.rapidapi.com/` after 2026-04-21 (approximate natural expiry of the stale entry), or any future deploy where the advertised rels at root drift from the deployed code.

## Description

An external consumer building drop-in React/Svelte/Vue components for the `@mountainpass/addressr-*` packages reports that the RapidAPI-fronted API root (`https://addressr.p.rapidapi.com/`) only advertises three rels in the `Link` header:

- `https://addressr.io/rels/address-search`
- `https://addressr.io/rels/health`
- `self`

The consumer expected the four additional v2 rels to be discoverable from the root:

- `https://addressr.io/rels/postcode-search`
- `https://addressr.io/rels/locality-search`
- `https://addressr.io/rels/state-search`
- `https://addressr.io/rels/api-docs`

This breaks HATEOAS discovery for the new search endpoints. Clients built on the documented discovery pattern cannot find the new endpoints without hardcoding paths.

## Symptoms

- `GET https://addressr.p.rapidapi.com/` returns a `Link` header missing the `postcode-search`, `locality-search`, `state-search`, and `api-docs` rels.
- First-class drop-in components (`@mountainpass/addressr-*`) cannot be built against the HATEOAS contract for the three new search endpoints.
- Downstream SDK integration tests that rely on root-level discovery of these rels will fail against the RapidAPI-fronted instance.

## Workaround

For SDK consumers (short-term):

1. Use direct path access for the three new endpoints — skip HATEOAS discovery: `/postcodes?q=…`, `/localities?q=…`, `/states?q=…`.
2. Publish the contract (paths, query params, response shapes) as an OpenAPI excerpt or README section for SDK authors. The deployed OpenAPI spec is available at `/api-docs`.

This workaround loses the benefit of discovery but unblocks the SDK build.

## Impact Assessment

- **Who is affected**: RapidAPI consumers using HATEOAS discovery; authors of `@mountainpass/addressr-*` drop-in SDK components; any integration that follows the root `Link` header to find search endpoints.
- **Frequency**: Every request to the RapidAPI-fronted root. The affected consumer is blocked now.
- **Severity**: Significant — the new v2 search endpoints (postcode, locality, state) were added in `231a409` and later commits but are not discoverable via the documented mechanism on the hosted service. Existing address-search continues to work; this is a contract regression for the new surface.
- **Analytics**: N/A — external bug report.

## Root Cause Analysis

### Preliminary Context

The current code at `src/waycharter-server.js:904-923` registers the `/` resource with:

```js
links: [
  ...addressesType.additionalPaths,
  ...localitiesType.additionalPaths,
  ...postcodesType.additionalPaths,
  ...statesType.additionalPaths,
  { rel: 'https://addressr.io/rels/api-docs', uri: '/api-docs' },
  { rel: 'https://addressr.io/rels/health', uri: '/health' },
],
```

Each of `localitiesType`, `postcodesType`, `statesType` has a `filters` entry for its respective search rel (`src/waycharter-server.js:754-758, 813-818, 866-871`). Waycharter's `registerCollection` populates `additionalPaths` from `filters` (`node_modules/@mountainpass/waycharter/dist/waycharter-convenience.js:158`).

Locally, code at v2.2.0 should emit all seven rels (self + 4 search + api-docs + health) from the root. P007 closure confirms v2.2.0 is deployed to production.

### Candidate Causes (unverified — investigate each)

1. **RapidAPI gateway strips or filters Link headers** — the proxy may only forward a subset of `Link` values (e.g., only rels that match a whitelist, or only the first value of the header). Test: hit `https://backend.addressr.io/` directly and compare the `Link` header value byte-for-byte.
2. **Deployment on AWS is lagging** — despite P007 being verified in v2.2.0, the OpenSearch-backed AWS environment may actually be running an earlier image. Test: query `/api-docs` on the RapidAPI-fronted API and check the `info.version`.
3. **Upstream backend URL pointed by RapidAPI is stale** — RapidAPI may still be pointing at a pre-v2 backend. Test: compare `x-powered-by` or backend-identifying headers between `https://backend.addressr.io/` and the RapidAPI proxy.
4. **Waycharter library regression** — `additionalPaths` returns empty for collections without an `itemPath`-less filter. Test: add a log line or write a unit test that calls `/` and asserts four search rels in the response body's links and in the `Link` response header.
5. **Header-size truncation** — some proxies truncate long `Link` headers. Test: count the character length of the emitted `Link` header.

### Investigation Tasks

- [ ] Reproduce against the deployed direct backend (`https://backend.addressr.io/` or the appropriate non-RapidAPI URL) and confirm whether postcode/locality/state rels are present there.
- [ ] If rels are present on the direct backend but missing on RapidAPI, file upstream with RapidAPI and/or adjust the RapidAPI listing/proxy config.
- [ ] If rels are missing on the direct backend, add a failing test (`test/resources/features/apiv2.feature` or similar) asserting all four search rels appear in the root response, then trace the waycharter call.
- [ ] Check `/api-docs` version against `package.json` to confirm deployed version.
- [ ] Decide on the SDK path: do we publish the direct-path contract as an interim (option 2 in the request), wait for discovery fix, or both?
- [ ] Respond to the external consumer with (a) current status, (b) interim direct-path contract, and (c) ETA for discovery fix. Route the reply through the voice-and-tone check per VOICE-AND-TONE.md.

### Consumer's Follow-up Questions (to answer in the reply)

- **Are the endpoints deployed to the RapidAPI-fronted instance, or only direct?** TBD — pending step 1 investigation. If only direct, confirm `backend.addressr.io` (or the appropriate non-RapidAPI base URL) is the target for their integration tests.
- **Response shapes?** From code:
  - `/postcodes` collection (`src/waycharter-server.js:790-811`) — array of `{ postcode, localities: [{ name }] }`.
  - `/postcodes/:postcode` (`src/waycharter-server.js:762-789`) — `{ postcode, localities: [{ name }] }` with `related` Link entries to localities.
  - `/localities` collection (`src/waycharter-server.js:707-752`) — array of `{ name, state: { name, abbreviation }, class?, postcode?, score, pid }`.
  - `/localities/:pid` (`src/waycharter-server.js:673-706`) — raw OpenSearch `_source` with `related` Link entries to postcode and state.
  - `/states` collection (`src/waycharter-server.js:845-864`) — array of `{ abbreviation, name }`.
  - `/states/:abbreviation` (`src/waycharter-server.js:821-843`) — `{ abbreviation, name }`.
  - These are **not** `{ sla, highlight }` shapes like address search — they are bespoke per resource.
- **Pagination?** Mixed — `/localities` has `hasMore` paging and emits `rel="next"` Link headers via waycharter; `/postcodes` and `/states` currently set `hasMore: false` (single-page results by aggregation).

## Fix Strategy (proposed)

Depends on root cause:

- **If RapidAPI gateway filtering**: work with RapidAPI config/support to pass through the full `Link` header; as a fallback, encode the rels into the response body (waycharter already does this in `links`), so body-based discovery still works and document that path.
- **If deployment lag**: trigger redeploy of v2.2.0 AWS environment; add a post-deploy smoke test that asserts all expected rels are present at `/`.
- **If waycharter regression**: patch the library or adapt the server code to emit the rels explicitly rather than via `additionalPaths`.
- **If RapidAPI listing drift (see P006)**: re-import the OpenAPI spec to RapidAPI so the new endpoints are registered in the marketplace contract.

Short-term (regardless of root cause): publish the three endpoints' contract (paths, params, shapes, pagination behaviour) in a README section or `/api-docs` excerpt so the SDK team can proceed without discovery. Reply to the external consumer with this contract.

## Related

- [P006: RapidAPI CI sync deferred](006-rapidapi-ci-sync-deferred.open.md) — marketplace listing drift; may compound this issue if RapidAPI still points at a pre-v2 listing
- [ADR 017: RapidAPI Distribution](../decisions/017-rapidapi-distribution.accepted.md)
- [ADR 022: Locality/Postcode from Address Details](../decisions/022-locality-postcode-from-address-details.proposed.md)
- [ADR 023: OpenAPI Spec RapidAPI CI Sync](../decisions/023-openapi-spec-rapidapi-ci-sync.proposed.md)
- Commits that added the v2 search endpoints: `231a409`, `b1e9ab1`, `d36ad8c`, `6956daf`, `00f6ff0`, `0249fa6`, `38764f5`, `ad2e5c0`
- `src/waycharter-server.js:904-923` — root resource registration
