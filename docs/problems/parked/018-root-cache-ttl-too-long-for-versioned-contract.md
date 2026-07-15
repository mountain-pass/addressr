# Problem 018: Root `/` cache TTL too long for a version-gated HATEOAS contract

**Status**: Parked
**Reported**: 2026-04-18
**Parked**: 2026-04-18
**Priority**: 9 (Medium) — Impact: Moderate (3) x Likelihood: Possible (3)

## Parked

**Reason**: User decision. The root `/` cache-control is long-lived by design. New rels are added infrequently — most releases don't change the rel set — and every client page load fetches this resource for HATEOAS discovery. Shortening the TTL would cost an origin round-trip per client request across the entire paid + free-tier consumer base, which is a worse tradeoff than the occasional post-deploy drift window.

When the rel set does change (rare), the operational playbook is to request a RapidAPI CF purge for `addressr.p.rapidapi.com/` (natural expiry is up to 7 days per P017 close notes). Consumers can also bypass via query-string cachebust or direct-path access.

**Un-park trigger**: Another rel-drift incident (P017-style) OR a user-directed change in policy (e.g., introducing a versioned root URL that side-steps the cache-propagation window entirely).

## Description

The root resource (`/`) on the v2 API returns `cache-control: public, max-age=604800` (7 days) at `src/waycharter-server.js` root registration. Its `Link` response header advertises the full set of discoverable rels (self, address-search, locality-search, postcode-search, state-search, api-docs, health) — a contract surface that evolves only when the team adds/removes a v2 endpoint.

When the rel set does change, intermediary caches retain the pre-release response for the full TTL. P017 was one instance of this — a v2.0.4 root response was cached at RapidAPI's CF edge and served for ~3 days after v2.1.0 → v2.2.0 added four new rels.

## Symptoms

- After a rel-changing release, some consumers discover the new rel set immediately while others see the stale advertisement for up to 7 days.
- Drop-in SDK packages relying on HATEOAS discovery (`@mountainpass/addressr-*`) cannot reliably target new endpoints until CDN caches naturally expire — **this is the accepted cost per the parking decision**.
- CF edges (RapidAPI's and Mountain Pass's) serve identical-looking `200 OK` responses with outdated rels; no error signal surfaces the drift.

## Workaround

- Short-term per-request: append a cache-busting query string (`?cachebust=<ts>`) — CF includes the query in the cache key.
- Mid-term: consumers can use documented direct paths (`/postcodes?q=`, `/localities?q=`, `/states?q=`) which work on the backend without needing HATEOAS discovery.
- Operationally, when the rel set changes in a release: request a RapidAPI CF purge for `/` to shortcut natural expiry.

## Impact Assessment

- **Who is affected**: Web/App Developer persona — RapidAPI consumers discovering the API via HATEOAS. AI Assistant User persona — MCP/agent integrations using link-following to find endpoints. Both are named in `docs/JOBS_TO_BE_DONE.md` (J2: Look up localities, postcodes, and states).
- **Frequency**: Every release that changes the root's rel set. Rare — most releases don't change the rel list.
- **Severity**: Moderate at the time of a rel-change release, otherwise none. Trade-off accepted because a short TTL would add origin load on every consumer page load permanently.
- **Analytics**: N/A — detection requires a consumer bug report (see P017).

## Root Cause Analysis

### Finding

`src/waycharter-server.js` root resource:

```js
headers: {
  etag: `"${version}"`,
  'cache-control': `public, max-age=${ONE_WEEK}`,
},
```

`ONE_WEEK = 604800`. The etag is version-only; CF edges don't revalidate with origin until `max-age` elapses, so the stale entry is served without revalidation for the full TTL. This is intentional per the parking decision — it's a propagation-time vs per-request-cost tradeoff.

### Previously Proposed Fix (rejected)

A short-TTL directive (`public, max-age=60, must-revalidate` or `no-cache`) would close the drift window but would cost an origin round-trip on every consumer page load. For a revenue-generating service with paid + free-tier consumers where the root is fetched at every page load for HATEOAS discovery, this is a worse tradeoff than the occasional post-deploy drift window. Rejected per user direction.

### Investigation Tasks (completed before parking)

- [x] Identify origin directive (`src/waycharter-server.js` root handler).
- [x] Confirm CF honors origin max-age (P017 probes: both Mountain Pass CF and RapidAPI CF cache per origin directive).
- [x] Weigh short-TTL candidates — rejected per parking decision.
- [x] Add regression test — `test/js/__tests__/waycharter-server.test.mjs` now guards against accidental shortening of the directive.

## Related

- [P017: RapidAPI root missing postcode/locality/state rels](017-rapidapi-root-missing-postcode-locality-state-rels.closed.md) — one instance of the accepted drift-window cost.
- [P019: No deploy-time smoke check for root Link header rel completeness](019-missing-root-link-header-smoke-assertion.open.md) — complementary observability gap, still worth fixing.
- [P023: Browser does not cache root `/` for cross-origin fetches](023-cross-origin-root-not-browser-cached.open.md) — separate concern; browser disk cache isn't populating regardless of origin TTL.
- `src/waycharter-server.js` root handler — the directive (long-lived by design).
- `test/js/__tests__/waycharter-server.test.mjs` — regression guard.
- ADR 012: HATEOAS waycharter API.
- ADR 017: RapidAPI distribution.
