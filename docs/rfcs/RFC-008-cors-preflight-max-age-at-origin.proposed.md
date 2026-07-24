---
status: proposed
rfc-id: cors-preflight-max-age-at-origin
reported: 2026-07-24
human-oversight: unconfirmed
decision-makers: [Tom Howard]
problems: [P023]
adrs: [ADR-037]
jtbd: [JTBD-001, JTBD-200]
stories: []
---

# RFC-008: Emit `Access-Control-Max-Age` on CORS preflight at the origin

**Status**: proposed
**Reported**: 2026-07-24
**Problems**: P023
**ADRs**: ADR-037 (CORS preflight caching policy — records the decision + the OPTIONS-before-proxyAuth ordering invariant)
**JTBD**: JTBD-001 (Search and Autocomplete — the cross-origin `fetch()` root-discovery latency tax), JTBD-200 (Protect the gateway boundary — the OPTIONS exemption must not open a data path)

> Auto-created at fix-time by the I13 propose-fix RFC-trace gate (ADR-072 placement / ADR-073 auto-create) on Known Error P023, whose Fix Strategy referenced no RFC vehicle. Born `human-oversight: unconfirmed`; ratified at `/wr-itil:manage-rfc accepted`.

## Summary

The Addressr origin answers CORS preflight (`OPTIONS`) requests with `Access-Control-Max-Age` so cross-origin browsers cache the preflight for the max-age window instead of re-running a full preflight before every GET. This closes the **preflight-flood half** of P023 (the origin-side, in-our-control layer). The GET disk-cache-miss half stays gateway-owned (RapidAPI's credentialed CORS × Chromium cache partitioning) with SDK memoisation as its documented workaround — that half is explicitly out of scope here.

## Driving problem trace

- **P023** (Browser does not disk-cache root `/` for cross-origin fetches): the origin emits no `Access-Control-Max-Age` on `OPTIONS`, so every cross-origin GET is gated by a fresh preflight. Confirmed by live probe (`OPTIONS /` returns the three env-var CORS headers and no `access-control-max-age` / `access-control-allow-methods`) and source inspection (`src/waycharter-server.js:560-581` — the env-var CORS middleware appends three headers, sets no Max-Age, registers no explicit OPTIONS handler). This is the source of the "2 OPTIONS preflights" half of the headline symptom, and it is origin-fixable.

## Scope

Implements the approved Fix Strategy "Option A" on P023 (single logical change, runtime response-header behaviour → carries a patch changeset):

1. **New `app.options(/.*/, ...)` handler** in `buildRest2App()` (`src/waycharter-server.js`), registered AFTER the existing env-var CORS middleware and BEFORE `app.use(proxyAuthMiddleware())`. It emits `Access-Control-Max-Age` (from `ADDRESSR_ACCESS_CONTROL_MAX_AGE`, default `86400`) and `Access-Control-Allow-Methods` (from `ADDRESSR_ACCESS_CONTROL_ALLOW_METHODS`, default `GET,OPTIONS`), then returns `204`. No new npm dependency (the `cors` package was explicitly rejected — Option B on P023).
2. **OPTIONS method-level exemption from proxy-auth**, realised by ordering: because the handler short-circuits with 204 before `proxyAuthMiddleware`, a raw preflight (which carries no gateway secret) is never 401-ed and the browser sees the cache directive. Data-carrying methods still fall through to `proxyAuthMiddleware` and remain enforced. This narrows ADR-024's enforcement on the method axis — recorded in ADR-037 with a cross-reference note on ADR-024.

**Chosen approach rationale** (chosen-path prose only per ADR-070): ordering-before-`proxyAuthMiddleware` (vs an explicit `method === 'OPTIONS'` check inside the middleware) keeps `proxyAuthMiddleware`'s allowlist focused on *paths*, leaves the ADR-024-tested middleware untouched, and co-locates the exemption with the OPTIONS responder. The always-on defaults (rather than `!== undefined` opt-in gating like the sibling CORS vars) are safe because a browser ignores `Access-Control-Max-Age` when no `Access-Control-Allow-Origin` is present (ACAO stays opt-in via the preceding middleware), so the defaults add no cross-origin exposure — the rationale is recorded in ADR-037.

Deliberately **out of scope** (preserved P023 known limitation — user-accepted, not re-litigated):
- The GET disk-cache miss (P023 Layer 2 — RapidAPI gateway's credentialed CORS × Chromium HTTP-cache partitioning). Not fixable at our origin; SDK-side memoisation is its workaround.
- Through-gateway efficacy of the origin `Max-Age` (whether it reaches the browser through the RapidAPI gateway) remains unproven — P023 investigation task 4 gates any *deploy-time efficacy claim* on a subscribed-key probe. This RFC ships the origin behaviour + its behavioural coverage; it does not assert the prod browser→gateway path is fixed.

## Verification

- Behavioural: `test/resources/features/cors-preflight.feature` (rest2 profile, live HTTP) — preflight returns 204 with the cache directives in both the self-hosted-default and proxy-auth-enforced profiles, and a data GET without the secret still returns 401 under proxy auth (the ordering invariant / JTBD-200 guard).
- Source-inspection: `test/js/__tests__/waycharter-server.test.mjs` — the `app.options` handler exists, emits both headers with the documented defaults, returns 204, and is registered before `proxyAuthMiddleware` (the ADR-037 ordering invariant, deterministic in the fast `test:js` suite).
