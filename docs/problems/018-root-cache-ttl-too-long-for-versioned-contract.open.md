# Problem 018: Root `/` cache TTL too long for a version-gated HATEOAS contract

**Status**: Open
**Reported**: 2026-04-18
**Priority**: 9 (Medium) — Impact: Moderate (3) x Likelihood: Possible (3)

## Description

The root resource (`/`) on the v2 API returns `cache-control: public, max-age=604800` (7 days) at `src/waycharter-server.js:919`. Its `Link` response header advertises the full set of discoverable rels (self, address-search, locality-search, postcode-search, state-search, api-docs, health) — a contract surface that evolves every release that adds or removes a rel.

The combination creates a structural bug: any release that changes the advertised rel set can be invisible to consumers who hit the RapidAPI-fronted root (or our own CF-fronted backend root) for up to 7 days, because intermediary caches retain the pre-release response for the full TTL. This was the root cause enabling P017's symptom — a v2.0.4 root response was cached at RapidAPI's CF edge and served for ~3 days after v2.1.0 → v2.2.0 added four new rels.

## Symptoms

- After a release that adds/removes a root rel, some consumers discover the new rel set immediately while others see the stale advertisement for up to 7 days.
- Drop-in SDK packages relying on HATEOAS discovery (`@mountainpass/addressr-*`) cannot reliably target new endpoints until CDN caches naturally expire.
- CF edges (RapidAPI's and Mountain Pass's) serve identical-looking `200 OK` responses with outdated rels; no error signal surfaces the drift.

## Workaround

- Short-term per-request: append a cache-busting query string (`?cachebust=<ts>`) — CF includes the query in the cache key.
- Mid-term: consumers can use documented direct paths (`/postcodes?q=`, `/localities?q=`, `/states?q=`) which work on the backend without needing HATEOAS discovery.
- No provider-side purge available via RapidAPI (see P017 Resolution).

## Impact Assessment

- **Who is affected**: Web/App Developer persona — RapidAPI consumers discovering the API via HATEOAS. AI Assistant User persona — MCP/agent integrations using link-following to find endpoints. Both are named in `docs/JOBS_TO_BE_DONE.md` (J2: Look up localities, postcodes, and states).
- **Frequency**: Every release that changes the root's rel set. Low-to-moderate cadence but cumulative — each release creates a drift window.
- **Severity**: Moderate — new v2 features are undiscoverable at the contract layer for up to 7 days. Existing consumers of `address-search` are unaffected.
- **Analytics**: N/A — detection today requires a consumer bug report (see P017).

## Root Cause Analysis

### Finding

`src/waycharter-server.js:917-920`:

```js
headers: {
  etag: `"${version}"`,
  'cache-control': `public, max-age=${ONE_WEEK}`,
},
```

`ONE_WEEK = 604800` at line 23. The etag is keyed only on the version string (no content hash), which would allow conditional revalidation (304) — but CF edges don't revalidate with origin until `max-age` elapses, so the stale entry is served without revalidation for the full TTL.

### Fix Strategy (proposed)

Change the root `/` cache-control from `public, max-age=604800` to a short value that lets CF edges re-fetch within minutes of each deploy. Candidates:

- `public, max-age=60, must-revalidate` — CF re-validates every 60s using the etag; `{}`-body response is negligible load.
- `no-cache` — CF always revalidates with origin via etag; strongest guarantee, slightly higher origin load (still trivial for a `{}` response).

Other endpoints (`/addresses`, `/localities`, etc.) should keep their current longer TTLs; their responses are content-hashed in the etag, so CF revalidation after TTL expiry returns 304 reliably. Only the root `/` needs the shorter TTL because its "content" is the rel list, which changes per release.

## Investigation Tasks

- [x] Identify origin directive (`src/waycharter-server.js:917-920`).
- [x] Confirm CF honors origin max-age (P017 probes: Mountain Pass CF and RapidAPI CF both observed caching per origin directive).
- [ ] Pick `max-age=60, must-revalidate` vs `no-cache` — decide based on load profile.
- [ ] Add failing test (cucumber or `node --test`) asserting root response `cache-control` matches the chosen directive. See P019 for the related smoke-test proposal.
- [ ] Update `src/waycharter-server.js:919`.
- [ ] Add changeset + release. Verify in production that CF edges re-fetch within the new TTL window.

## Related

- [P017: RapidAPI root missing postcode/locality/state rels](017-rapidapi-root-missing-postcode-locality-state-rels.closed.md) — enabled by this problem.
- [P019: No deploy-time smoke check for root Link header rel completeness](019-missing-root-link-header-smoke-assertion.open.md) — complementary observability gap.
- `src/waycharter-server.js:917-920` — the directive.
- ADR 012: HATEOAS waycharter API.
- ADR 017: RapidAPI distribution.
