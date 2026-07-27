---
status: 'proposed'
date: 2026-07-24
human-oversight: confirmed
oversight-date: 2026-07-27
decision-makers: [Tom Howard]
consulted: []
informed: []
reassessment-date: 2026-10-24
---

# ADR 037: CORS preflight caching policy — emit `Access-Control-Max-Age` at the origin, exempt OPTIONS from proxy-auth

> Captured while completing the user-approved fix for [P023](../problems/verifying/023-cross-origin-root-not-browser-cached.md). The chosen option (env-var-driven `Access-Control-Max-Age` on an explicit `OPTIONS` handler, ordered before `proxyAuthMiddleware`) was user-approved this session (binding "Option A"); the surrounding MADR substance was derived by the authoring agent from the P023 root-cause analysis + the `wr-architect:agent` review. Ratified 2026-07-27 at the `/wr-architect:review-decisions` drain (`human-oversight: confirmed`). The P023 through-gateway efficacy probe (investigation task 4) remains open and gates any end-to-end efficacy claim, but it does not gate ratification of the origin behaviour this ADR records.

## Context and Problem Statement

Cross-origin browsers re-run a full CORS preflight (`OPTIONS`) before every GET to the Addressr root `/`, because the origin sends no `Access-Control-Max-Age` on preflight responses (confirmed by live probe and by source inspection of the env-var CORS middleware at `src/waycharter-server.js:560-581`, which appends three headers, sets no Max-Age, and registers no explicit `OPTIONS` handler). This is the origin-side, in-our-control half of [P023](../problems/verifying/023-cross-origin-root-not-browser-cached.md): every consumer page load doing cross-origin `fetch()` to the API root pays a preflight round-trip on top of the GET.

Fixing it interacts with [ADR 024](024-origin-gateway-auth-header-enforcement.accepted.md): the CORS middleware runs _before_ `proxyAuthMiddleware()`, whose closed allowlist is `/health` + `/api-docs` (a **path** allowlist). A raw preflight carries no gateway secret, so on a proxy-auth-enabled origin an `OPTIONS` would be 401-ed and any appended `Max-Age` would never reach the browser. Emitting a preflight-cache directive therefore requires the preflight to be answered _before_ proxy-auth enforcement — a **method-level** exemption ADR 024 does not currently acknowledge.

The GET disk-cache-miss half of P023 (RapidAPI gateway's credentialed CORS × Chromium HTTP-cache partitioning) is **not** origin-fixable and is out of scope for this decision.

## Decision Drivers

- Reduce the preflight-flood latency tax on the Web/App Developer persona's cross-origin `fetch()` root discovery (JTBD-001).
- Do not open a data path: the OPTIONS exemption must not let a data-carrying request bypass proxy-auth (JTBD-200 / ADR 024).
- Honour the ADR-024 `ADDRESSR_*` env-var, operator-configurable convention; add no new npm dependency.
- Keep `proxyAuthMiddleware`'s allowlist focused and its ADR-024-tested behaviour untouched.

## Considered Options

- **Option A** — new `ADDRESSR_ACCESS_CONTROL_MAX_AGE` (+ `ADDRESSR_ACCESS_CONTROL_ALLOW_METHODS`) env vars emitted by an explicit `app.options` handler ordered _before_ `proxyAuthMiddleware`, returning 204. Honours the env-var convention, zero new deps, keeps the exemption co-located with the OPTIONS responder.
- **Option B** — adopt the `cors` npm package. Cleaner preflight handling but a new dependency + a departure from the env-var pattern (its own decision surface).
- **Option C** — do nothing at the origin; rely on documented SDK memoisation + a RapidAPI support ticket, consistent with the disk-cache miss being gateway-owned.

## Decision Outcome

Chosen option: **Option A** — emit `Access-Control-Max-Age` (env var `ADDRESSR_ACCESS_CONTROL_MAX_AGE`, default `86400`) and `Access-Control-Allow-Methods` (env var `ADDRESSR_ACCESS_CONTROL_ALLOW_METHODS`, default `GET,OPTIONS`) from an explicit `app.options(/.*/, ...)` handler in `buildRest2App()`, returning `204`, registered after the existing env-var CORS middleware and **before** `app.use(proxyAuthMiddleware())`. No new dependency.

**Risk-driven refinement (2026-07-25, R1).** As originally committed the handler was _always on_ (defaults `|| '86400'` / `|| 'GET,OPTIONS'`), registered unconditionally. The pre-push pipeline risk-scorer returned STOP at 6/25 (one above the 5/25 appetite) on that defaults-on-everywhere blast radius. Remediation R1 (ADR-042 Rule 2, applied in the same commit) **gates the whole `app.options` registration behind the same `ADDRESSR_ACCESS_CONTROL_ALLOW_ORIGIN !== undefined` opt-in the sibling CORS response headers use**. `Access-Control-Max-Age` is inert without `Access-Control-Allow-Origin`, so this loses no efficacy: when CORS is enabled the fix applies exactly as user-approved (Max-Age `86400` default, Allow-Methods `GET,OPTIONS` default, 204); when CORS is not enabled the handler is not registered, no cache directive is emitted, and the OPTIONS auth-exemption does not exist. This is the shape the user ratifies at the `/wr-architect:review-decisions` drain — not the stale always-on text.

**Ordering is the exemption.** When registered, the OPTIONS handler short-circuits with 204 before `proxyAuthMiddleware`, so a preflight is never 401-ed; data-carrying methods still fall through and remain enforced. This is a **method-level exemption that narrows [ADR 024](024-origin-gateway-auth-header-enforcement.accepted.md)**: alongside its `/health` + `/api-docs` path allowlist, `OPTIONS /<any-path>` is answered 204 ahead of enforcement **only on the CORS-enabled profile** (both self-hosted-with-CORS and proxy-auth-with-CORS). On a CORS-_disabled_ origin the handler is absent and `OPTIONS` falls through to `proxyAuthMiddleware` (prior behaviour).

**Ordering invariant** (regression-guarded): `app.options(...)` MUST precede `app.use(proxyAuthMiddleware())`. A reorder would silently make preflights 401 (or bypass a future method-sensitive auth check). Guarded by a source-inspection test (`test/js/__tests__/waycharter-server.test.mjs`, deterministic) and a behavioural test (`test/resources/features/cors-preflight.feature`, live HTTP) pinning OPTIONS→204 AND GET-without-secret→401 under proxy auth.

**Efficacy is not claimed here.** In production the browser talks to the RapidAPI gateway, not the origin; whether an origin `Max-Age` reaches the browser (or is intercepted by the gateway) is unproven — P023 investigation task 4 gates any deploy-time efficacy claim on a subscribed-key probe. This ADR ratifies the origin behaviour + its coverage, not end-to-end efficacy.

## Consequences

- **Good:** preflight round-trips drop from ~1 per cross-origin GET to ~1 per browser per origin per max-age window for direct-origin consumers; no new dependency; operator-configurable via env vars; the exemption leaves the ADR-024-tested middleware untouched.
- **Good (R1 refinement):** the preflight-cache handler is now **coherent with the sibling CORS opt-in** — it is registered only when `ADDRESSR_ACCESS_CONTROL_ALLOW_ORIGIN` is set, the same condition under which a browser can act on `Access-Control-Max-Age` at all. This removes the defaults-on-everywhere blast radius that scored STOP 6/25, and it narrows the OPTIONS auth-exemption to the deliberately-CORS-enabled profile (strengthening the JTBD-200 "do not open a data path" guard: on a CORS-off origin no method-level exemption exists).
- **Neutral / accepted:** on a CORS-enabled origin, `OPTIONS /<any-path>` returning 204 discloses endpoint shape but **no user data** — a preflight is inherently unauthenticated (a browser can never attach the gateway secret). This is the intended, user-approved behaviour when CORS is on.
- **Neutral:** the GET disk-cache miss (P023 Layer 2) is untouched — gateway-owned, SDK-memoisation workaround stands.
- **Note (superseded rationale):** the original commit shipped the handler _always on_ and booked the resulting break of the sibling opt-in gating as "safe and accepted." R1 supersedes that trade-off — the always-on default is replaced by the gated shape above. The efficacy argument (Max-Age inert without ACAO) is unchanged; only the blast radius is tightened.

## Confirmation

- **CORS-enabled profile:** with `ADDRESSR_ACCESS_CONTROL_ALLOW_ORIGIN` set, `OPTIONS /` → 204 with `Access-Control-Max-Age: 86400` and `Access-Control-Allow-Methods: GET,OPTIONS` (`cors-preflight.feature` scenario "Preflight returns 204 with cache directives when CORS is enabled").
- **CORS-disabled profile (R1 inert):** with `ADDRESSR_ACCESS_CONTROL_ALLOW_ORIGIN` unset, `OPTIONS /` emits **no** `Access-Control-Max-Age` — the handler is not registered (`cors-preflight.feature` scenario "Preflight is inert when CORS is not enabled (R1)").
- **Proxy-auth-enabled profile (CORS on):** `OPTIONS /` → 204 with the cache directives (not 401), AND a data GET without the secret still → 401 (`cors-preflight.feature` scenario "Preflight is exempt but data methods stay enforced when proxy auth is on", plus `proxy-auth-enforcement.feature` for the enforcement baseline).
- **Gating pinned in source (R1):** `app.options(` is registered only inside the `ADDRESSR_ACCESS_CONTROL_ALLOW_ORIGIN !== undefined` guard (`waycharter-server.test.mjs`, source-inspection).
- **Exemption stays OPTIONS-scoped (R2):** the only pre-`proxyAuthMiddleware` method short-circuit in `buildRest2App` is `app.options` — no data-carrying method (`all`/`get`/`post`/`put`/`delete`/`patch`) is answered ahead of enforcement (`proxy-auth.test.mjs`, source-inspection), backed by the runtime `GET /addresses` → 401 coverage in the same file.
- **Ordering invariant:** `app.options(` is registered before `app.use(proxyAuthMiddleware())` (`waycharter-server.test.mjs`, source-inspection).
- **No new dependency:** `cors` absent from `package.json` / lockfile.

## Reassessment Criteria

- The P023 through-gateway efficacy probe (subscribed-key test of whether the origin `Max-Age` reaches the prod browser) returns — confirm or revise the origin approach. (Oversight ratification is no longer pending; drained 2026-07-27.)
- A performance-budget ADR is introduced for the origin runtime path (none exists today) — re-file the preflight-handler cost against it.
- The `cors` package is reconsidered (Option B) if preflight policy grows beyond two headers.

## More Information

- [P023](../problems/verifying/023-cross-origin-root-not-browser-cached.md) — root-cause analysis + Fix Strategy.
- [RFC-008](../rfcs/RFC-008-cors-preflight-max-age-at-origin.proposed.md) — the fix vehicle tracing P023.
- [ADR 024](024-origin-gateway-auth-header-enforcement.accepted.md) — proxy-auth enforcement narrowed by this decision (OPTIONS method-level exemption).
- [ADR 017](017-rapidapi-distribution.accepted.md) — RapidAPI distribution; the gateway layer that owns the GET disk-cache-miss half of P023.
