# Problem 023: Browser does not cache root `/` for cross-origin fetches despite `public, max-age=604800`

**Status**: Open
**Reported**: 2026-04-18
**Priority**: 10 (High) — Impact: Minor (2) x Likelihood: Almost certain (5)

## Description

SDK authors building drop-in components for `@mountainpass/addressr-*` report that Chromium does not cache the root API response for cross-origin `fetch()` calls, even though the response carries `Cache-Control: public, max-age=604800`. Two back-to-back `fetch()` calls from the same Playwright page each produce a full CORS preflight + GET round-trip, confirmed via Chrome DevTools Protocol. Every page load in every consumer app costs a full network round-trip to discover the HATEOAS root.

This is distinct from P017 / P018 (CDN edge caching) — this is the **browser (client-side disk) cache** not populating at all.

## Symptoms

- Two identical `fetch('https://addressr.p.rapidapi.com/')` calls from the same browser page trigger 4 network events: 2 OPTIONS preflights + 2 GETs.
- All events show `fromDiskCache: false` in CDP traces.
- Preflight re-runs every request because the server sends no `Access-Control-Max-Age` header on OPTIONS.
- Perceived latency per consumer page load includes two round-trips just to discover the API root.

## Workaround

- SDK authors can maintain an in-memory cache of the root response within their own component lifecycle (client-side memoisation).
- Consumers bypass root discovery entirely by using documented direct paths (`/addresses?q=`, `/postcodes?q=`, `/localities?q=`, `/states?q=`) — workaround already documented in P017 Resolution.

## Impact Assessment

- **Who is affected**: Web/App Developer persona building drop-in components; AI Assistant User persona for MCP/agent integrations that do HATEOAS discovery on each call. Downstream — every end user of every app built on `@mountainpass/addressr-*` SDKs pays the latency cost.
- **Frequency**: Every page load of every consumer app that does cross-origin fetches to the API root.
- **Severity**: Minor — the API works correctly; only the browser cache efficiency is degraded. No functional defect. Paying consumers experience added latency per page load (two extra round-trips).
- **Analytics**: N/A — evidence from Playwright CDP probe (reporter's test harness).

## Root Cause Analysis

### Finding

Evidence, from the SDK team's Playwright + CDP probe:

- Two back-to-back `fetch()` calls → 4 events: 2 preflights, 2 GETs, all `fromDiskCache: false`.
- Response includes `cache-control: public, max-age=604800` but browser still skips the cache.
- Preflight (OPTIONS) responses carry no `Access-Control-Max-Age` — every GET requires a fresh preflight.

Reporter's hypotheses (not yet confirmed):

1. **Preflight flood** — server-side: no `Access-Control-Max-Age` on OPTIONS → every GET gated by a fresh preflight. Addressable on the origin, but likely won't help the GET-response disk cache.
2. **Credentialed CORS + Chromium cache rules** — wire inspection showed `access-control-allow-credentials: true` and specific origin echoed back. Chromium's cache heuristics for credentialed cross-origin responses are known to differ from same-origin / non-credentialed responses. Confirmed by spec: the HTTP cache partitioning and the "if request's credentials mode is 'omit'" branches in Fetch mean credentialed responses can be cached less aggressively or under a narrower key.
3. **Unknown response header** defeating caching (e.g., `Vary: *`, `Cache-Control: private` added by an intermediary).

### Layer attribution

Direct probe of the addressr origin (earlier P017 work) showed CORS response headers:

```
access-control-allow-origin: *
access-control-allow-headers: *
access-control-expose-headers: *
```

No `Access-Control-Allow-Credentials`, no `Access-Control-Max-Age` on the origin. The reporter's `access-control-allow-credentials: true` observation is likely injected by RapidAPI's gateway when the request arrives with an `Origin` header — same layer as P017's stale-cache issue.

This means two layers contribute:

- **Our origin** can add `Access-Control-Max-Age` to the preflight OPTIONS response. That reduces preflight flood even if it doesn't unlock GET disk caching.
- **RapidAPI's gateway** is the source of `access-control-allow-credentials: true` (and possibly the specific-origin echo replacing our `*`). We do not control that. If Chromium's no-cache behaviour is triggered by the gateway's credentialed CORS response, the fix must live at the gateway layer (support ticket) or the SDK layer (client-side memoisation).

### Candidate fixes (by layer)

- **Origin-side**:
  - Add `Access-Control-Max-Age: 86400` (or similar) to preflight responses. Cuts preflight round-trips to 1 per day per origin.
  - Add a CORS middleware that sets the Access-Control-\* headers explicitly on OPTIONS, rather than relying on environment variables.
- **RapidAPI-gateway-side** (no direct control):
  - File a RapidAPI support ticket asking for `Access-Control-Allow-Credentials: true` to be removed when the consumer does not need credentials. May not be possible.
  - Accept the gateway-layer behaviour and fix in the SDK.
- **SDK-side** (`@mountainpass/addressr-*`):
  - In-memory memoise the root response per component/session lifecycle. Avoid repeated cross-origin round-trips by design.
  - Batch discovery at app init rather than per-component.

## Investigation Tasks

- [ ] Reproduce the Playwright CDP probe in our repo OR obtain the reporter's harness so the finding is locally repeatable.
- [ ] Capture the full response header set from `addressr.p.rapidapi.com/` with a Chromium `Origin` header to confirm `access-control-allow-credentials: true` and specific-origin echo originate at the RapidAPI gateway, not our origin.
- [ ] Check whether adding `Access-Control-Max-Age` to our origin's OPTIONS response actually reduces preflight flood in the reporter's harness — or if RapidAPI's gateway intercepts OPTIONS independently.
- [ ] Read Chromium cache-partitioning docs to confirm whether credentialed cross-origin GETs with `public, max-age` are cacheable at all in practice.
- [ ] Decide whether the preferred fix is origin-side (Access-Control-Max-Age), SDK-side (memoisation), or both.
- [ ] Write a failing test — ideally a Playwright test that asserts 2 back-to-back `fetch('/')` calls produce ≤1 preflight + ≤1 GET with `fromDiskCache: true` on the second.

## Related

- [P017: RapidAPI root missing postcode/locality/state rels](017-rapidapi-root-missing-postcode-locality-state-rels.closed.md) — same RapidAPI gateway layer; demonstrates that gateway responses behave independently of origin intent.
- [P018: Root `/` cache TTL too long for a version-gated HATEOAS contract](018-root-cache-ttl-too-long-for-versioned-contract.open.md) — adjacent cache concern at the CDN edge layer. Fixing P018 (short origin TTL) would not fix P023 (browser isn't caching at all).
- [P019: No deploy-time smoke check for root Link header rel completeness](019-missing-root-link-header-smoke-assertion.open.md) — CI observability gap; could also cover a preflight-count smoke test if we go that route.
- [ADR 017: RapidAPI Distribution](../decisions/017-rapidapi-distribution.accepted.md)
- [ADR 024: Origin gateway auth header enforcement](../decisions/024-origin-gateway-auth-header-enforcement.accepted.md) — relevant because proxy-auth headers affect cross-origin request patterns.
- `src/waycharter-server.js:556-577` — current CORS middleware (env-var-driven, no Access-Control-Max-Age).
- SDK team's Playwright CDP probe (external — not yet in this repo).
