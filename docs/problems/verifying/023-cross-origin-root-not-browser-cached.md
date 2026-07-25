# Problem 023: Browser does not cache root `/` for cross-origin fetches despite `public, max-age=604800`

**Status**: Verification Pending
**Reported**: 2026-04-18
**Root cause confirmed**: 2026-07-24 (live origin probe + source attribution)
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

### Confirmed root cause (2026-07-24)

Live probe of the origin (`curl -sSI` GET and `curl -sSI -X OPTIONS` against `https://backend.addressr.io/`, both returning 401 through the auth gate) plus source inspection confirm a **two-layer composite**, and disambiguate which layer owns each symptom:

**Layer 1 — preflight flood (OUR ORIGIN, in our control) — CONFIRMED.**
The origin emits **no `Access-Control-Max-Age`** on `OPTIONS`, so every cross-origin GET is gated by a fresh preflight. Confirmed two ways:

- Live probe: `OPTIONS /` returns `access-control-allow-origin: *`, `access-control-allow-headers: *`, `access-control-expose-headers: *`, and **no** `access-control-max-age` / `access-control-allow-methods`.
- Source: the CORS middleware at `src/waycharter-server.js:560-581` is env-var-driven (`ADDRESSR_ACCESS_CONTROL_ALLOW_ORIGIN` / `_EXPOSE_HEADERS` / `_ALLOW_HEADERS`), appends those three headers only, never sets `Access-Control-Max-Age`, and registers no explicit `OPTIONS` handler. Nothing in the codebase emits a preflight-cache directive.

This is the source of the "2 OPTIONS preflights" half of the headline symptom, and it is origin-fixable.

**Layer 2 — GET disk-cache miss (RapidAPI GATEWAY + Chromium, NOT in our control) — attributed.**
The `fromDiskCache: false` on the GET is **not** an origin defect. Live probe shows our origin sends `access-control-allow-origin: *` and **no** `access-control-allow-credentials`. The reporter's `access-control-allow-credentials: true` + specific-origin echo is injected by the **RapidAPI gateway** (same layer, same behaviour as P017). A credentialed cross-origin response forces the browser into credentialed-fetch mode, where Chromium's HTTP-cache partitioning (network isolation key) suppresses/narrows disk caching regardless of `public, max-age`. Since the credentialed CORS originates at the gateway, **the disk-cache miss is not fixable at our origin** — only at the SDK layer (memoisation) or via a RapidAPI support request.

**Headline-symptom attribution:** the composite `2 preflights + 2 GETs, all fromDiskCache:false` splits cleanly — the **preflight** half is our origin (missing `Access-Control-Max-Age`); the **GET disk-cache-miss** half is the gateway's credentialed CORS × Chromium partitioning. Only the preflight half is ours to fix, and fixing it removes ~half the round-trips (the repeated OPTIONS), not the GET miss.

**Impact scoping (per JTBD review):** the browser-disk-cache root cause is **Web/App Developer**-specific (drop-in components doing cross-origin `fetch()` from a Chromium context). The **AI Assistant User** persona calls Addressr via MCP tools in a Node/tool runtime, not a Chromium disk cache, so the `fromDiskCache` root cause does not literally reach it — it is affected only insofar as an MCP server itself makes browser-context cross-origin fetches. Original Impact Assessment over-attributed to that persona.

### Fix Strategy (Option A — user-approved 2026-07-24; IMPLEMENTED, Fix Released pending)

**Implemented 2026-07-24** via [RFC-008](../../rfcs/RFC-008-cors-preflight-max-age-at-origin.proposed.md) + [ADR-037](../../decisions/037-cors-preflight-caching-policy.proposed.md): explicit `app.options(/.*/, ...)` handler in `buildRest2App()` (`src/waycharter-server.js`) emitting `Access-Control-Max-Age` (`ADDRESSR_ACCESS_CONTROL_MAX_AGE`, default 86400) + `Access-Control-Allow-Methods` (`ADDRESSR_ACCESS_CONTROL_ALLOW_METHODS`, default `GET,OPTIONS`), returning 204, ordered before `proxyAuthMiddleware` (OPTIONS method-level exemption; narrows ADR-024 — cross-referenced there). No new dependency. Covered by `test/resources/features/cors-preflight.feature` (rest2, live HTTP — both profiles + the GET-still-401 ordering guard) and `test/js/__tests__/waycharter-server.test.mjs` (source-inspection ordering invariant).

This fix targets the **preflight-flood half** only. The GET disk-cache-miss half (Layer 2, gateway-owned) is out of scope — SDK memoisation remains its workaround. The through-gateway efficacy probe (investigation task 4) is still unresolved, so end-to-end efficacy through the RapidAPI gateway is not yet proven. **Released in v3.0.2 on 2026-07-25 (Known Error → Verification Pending) — see [Fix Released](#fix-released) below.**

**Release vehicle**: .changeset/p023-cors-preflight-max-age.md

**Original proposal (retained for lineage):**

The one origin-side, in-our-control lever is to **emit `Access-Control-Max-Age` on preflight responses** so cross-origin GETs stop re-preflighting on every call (cuts preflight round-trips to ~1 per origin per max-age window). This does **not** unlock GET disk caching (Layer 2, gateway-owned).

Exact locus: `src/waycharter-server.js:560-581` (the env-var CORS middleware; ticket previously cited `556-577`). Load-bearing constraint from architect review — **ADR-024 interaction**: that middleware runs _before_ `proxyAuthMiddleware()` (line 583), whose closed allowlist is `/health` + `/api-docs` only. A raw preflight `OPTIONS` carries no gateway secret, so on a proxy-auth-enabled origin it currently 401s and any appended `Max-Age` never reaches the browser. The fix must therefore either short-circuit `OPTIONS` **before** `proxyAuthMiddleware`, or exempt the `OPTIONS` method in `proxyAuthMiddleware` — an **amendment to ADR-024's Behaviour section** (method-level exemption; preflights expose no user data, so consistent with its rationale).

This is a **NEEDS-DIRECTION** decision (no CORS/preflight-policy ADR exists; ≥2 viable options). Option set for the queued approval:

- **Option A (architect lean):** new `ADDRESSR_ACCESS_CONTROL_MAX_AGE` (+ `ADDRESSR_ACCESS_CONTROL_ALLOW_METHODS`) env vars, appended in the existing middleware matching the `!== undefined` gating of its siblings; explicit `OPTIONS` handler ordered before `proxyAuthMiddleware`. Honours the ADR-024 env-var convention, zero new deps. Keep SDK memoisation as-is.
- **Option B:** adopt the `cors` npm package — cleaner preflight handling but a new dependency + departure from the env-var pattern (own decision surface).
- **Option C:** do nothing at the origin — rely on documented SDK memoisation + a RapidAPI support ticket, consistent with the disk-cache miss being gateway-owned.

**Efficacy still unproven** (architect gate): in prod the browser talks to RapidAPI, not the origin, so an origin-only `Max-Age` may be intercepted by the gateway and never reach the browser (investigation task 3 below). The header change should be gated on that probe — "Known Error" reflects a confirmed two-layer root cause, **not** a validated origin fix. Also flagged: root `/` is a high-traffic endpoint, so this cache-directive change is an ops decision reserved for the user (cf. P018 `no-cache` rejection), and a CORS-preflight-policy ADR should be recorded when the change is proposed.

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

- [x] Capture origin response headers to attribute `access-control-allow-credentials: true` / specific-origin echo to the gateway, not our origin. **Done 2026-07-24** — live `curl` GET+OPTIONS on `backend.addressr.io` shows origin sends `access-control-allow-origin: *`, no `allow-credentials`, no `Access-Control-Max-Age`; confirms the credentialed CORS is gateway-injected (matches source at `src/waycharter-server.js:560-581`).
- [x] Confirm (from spec) whether credentialed cross-origin GETs with `public, max-age` disk-cache in practice. **Done** — Chromium partitions the HTTP cache by network isolation key and narrows caching for credentialed cross-origin responses; the GET miss is inherent to the gateway's credentialed CORS, not the origin.
- [x] Decide the preferred fix. **Done** — origin-side `Access-Control-Max-Age` (Option A lean) for the preflight half + SDK-side memoisation for the GET half; queued for user approval (see Fix Strategy). This is the transition-to-Known-Error basis.
- [ ] **(efficacy gate — blocks the header commit)** Probe through the RapidAPI gateway with a subscribed key: does an origin `Access-Control-Max-Age` on OPTIONS actually reach the browser, or does the gateway intercept OPTIONS independently? (Origin-only probe here got 401 through the auth gate; a subscribed key is needed to test the prod browser→gateway path.)
- [ ] Reproduce the Playwright CDP probe in our repo OR obtain the reporter's harness so the finding is locally repeatable.
- [x] Write a failing test — the preflight-flood half is now covered by `test/resources/features/cors-preflight.feature` (rest2 live HTTP: OPTIONS→204 + `Access-Control-Max-Age`/`Access-Control-Allow-Methods` in both self-hosted and proxy-auth profiles, plus GET-without-secret→401 ordering guard) and `test/js/__tests__/waycharter-server.test.mjs` (source-inspection: handler exists, defaults, 204, ordered before `proxyAuthMiddleware`). **Done 2026-07-24.** The Playwright/CDP `fromDiskCache` assertion belongs to the Layer-2 (gateway) half and stays with task 5.

## Related

- [P017: RapidAPI root missing postcode/locality/state rels](017-rapidapi-root-missing-postcode-locality-state-rels.closed.md) — same RapidAPI gateway layer; demonstrates that gateway responses behave independently of origin intent.
- [P018: Root `/` cache TTL too long for a version-gated HATEOAS contract](018-root-cache-ttl-too-long-for-versioned-contract.open.md) — adjacent cache concern at the CDN edge layer. Fixing P018 (short origin TTL) would not fix P023 (browser isn't caching at all).
- [P019: No deploy-time smoke check for root Link header rel completeness](019-missing-root-link-header-smoke-assertion.open.md) — CI observability gap; could also cover a preflight-count smoke test if we go that route.
- [ADR 017: RapidAPI Distribution](../decisions/017-rapidapi-distribution.accepted.md)
- [ADR 024: Origin gateway auth header enforcement](../decisions/024-origin-gateway-auth-header-enforcement.accepted.md) — relevant because proxy-auth headers affect cross-origin request patterns.
- `src/waycharter-server.js:560-581` — current CORS middleware (env-var-driven, no Access-Control-Max-Age); `proxyAuthMiddleware()` at line 583 gates OPTIONS (ADR-024 interaction, see Fix Strategy).
- SDK team's Playwright CDP probe (external — not yet in this repo).

## Fix Released

Released 2026-07-25 in **v3.0.2** — published to npm as `@mountainpass/addressr@3.0.2` and deployed to production via Terraform; the release-pipeline prod smoke test PASSED. Fix commit: `5a36b79` `fix(cors): cache CORS preflight via Access-Control-Max-Age at origin (P023)`, shipped via `.changeset/p023-cors-preflight-max-age.md` (now consumed).

Ships the Option A origin-side fix only: an explicit `app.options(/.*/, ...)` handler in `buildRest2App()` returning 204 with `Access-Control-Max-Age` (`ADDRESSR_ACCESS_CONTROL_MAX_AGE`, default 86400) and `Access-Control-Allow-Methods` (`ADDRESSR_ACCESS_CONTROL_ALLOW_METHODS`, default `GET,OPTIONS`), ordered ahead of `proxyAuthMiddleware` per the ADR-024 method-level exemption.

**Verification criterion**: confirm an `OPTIONS` preflight to the production root `/` returns **204** and carries **`Access-Control-Max-Age`**.

**Caveat — through-gateway efficacy remains unproven.** This closes the preflight-flood half (Layer 1, origin) only. Investigation task 4 (probe through the RapidAPI gateway with a subscribed key: does the origin's `Access-Control-Max-Age` actually reach the browser, or does the gateway answer/intercept `OPTIONS` independently?) is still open. The GET disk-cache-miss half (Layer 2, gateway-injected credentialed CORS × Chromium cache partitioning) is out of scope and keeps SDK memoisation as its workaround.

## RFCs

| RFC     | Status   | Title                                                         |
| ------- | -------- | ------------------------------------------------------------- |
| RFC-008 | proposed | Emit `Access-Control-Max-Age` on CORS preflight at the origin |
