# Problem 068: G-NAF loader fails with CloudFront 403 from data.gov.au

**Status**: Closed
**Reported**: 2026-07-29
**Closed**: 2026-07-29 — closed-as-already-fixed on user confirmation. Traversed Open → Known Error → Verification Pending → Closed in a single session; the intermediate states never existed independently, so the ladder landed as one commit per ADR-014 batch grain rather than three near-empty transition commits.
**Origin**: inbound-reported (#458)
**Priority**: 16 (High) — Impact: Significant (4) × Likelihood: Likely (4) — derived at capture from the description per Step 4a. Impact 4 per RISK-POLICY § Impact: the self-hosted npm/Docker loader fails a subset of operations (it cannot download G-NAF, so fresh installs and re-indexing are blocked); the already-indexed live RapidAPI service is unaffected. Likelihood 4: an external user reproduced it (`curl -I https://data.gov.au` → 403) and reports it failing consistently for weeks, so it is a confirmed, currently-active failure mode (ADR-076 inbound-report evidence — honest field risk, not a rank lever).
**Effort**: S — re-rated M → S at the Known Error transition per P047 (creation-time estimates drift as scope clarifies). The capture-time M assumed the investigate-and-adapt work was still ahead. It was not: the fix shipped 2026-04-28 in commit 741fd21, three months before this ticket was captured. No remaining implementation work — the residual is verification only.
**WSJF**: 16.0 — (16 × 1.0) / 1 — recomputed on the re-rated Effort; academic, as the ticket transitions to Closed in the same session.
**JTBD**: JTBD-202
**Persona**: self-hosted-operator

## Description

Reported at [mountain-pass/addressr#458](https://github.com/mountain-pass/addressr/issues/458) by an external self-hoster: the loader that fetches the G-NAF dataset from `data.gov.au` now fails with `403 Forbidden (CloudFront)`. It worked for the prior 7–8 months and started failing consistently in the last 3–4 weeks. Reproduced independently of the loader with:

```
curl -I https://data.gov.au
→ HTTP/2 403, server: CloudFront, x-cache: Error from cloudfront
```

## Symptoms

Loader run aborts on the G-NAF download step with a CloudFront 403. The failure is at fetch time, before any indexing, so a self-hosted install cannot obtain a fresh dataset.

## Workaround

Point the loader at a previously-downloaded copy of the G-NAF archive to keep a self-hosted install running while the fetch is fixed. Communicated to the reporter on #458 (2026-07-29).

## Impact Assessment

- **Who is affected**: self-hosted operators running the loader (npm / Docker); paid RapidAPI consumers are unaffected (the live service is already indexed).
- **Frequency**: consistent for the reporter over 3–4 weeks; likely affects every self-hoster attempting a fresh load in that window.
- **Severity**: Significant — blocks fresh install and re-index for self-hosters.

## Root Cause Analysis

### Confirmed Root Cause

data.gov.au placed a CloudFront WAF rule in front of the CKAN API that rejects requests carrying no User-Agent (the Node/undici default). The rule returns a 403 whose body is an HTML error page, so the loader's `JSON.parse` of the `package_show` response fails at fetch time, before any indexing. The trigger was an upstream CDN policy change, not an addressr code change — which is why it began failing after 7–8 months of working. addressr's exposure was that its loader sent no User-Agent at all.

Confirmed by bisect on 2026-04-28: the same CKAN URL with no User-Agent returned 403; with a Mozilla-prefixed compatible-mode User-Agent it returned 200.

### Fix

Already shipped. Commit `741fd21` (2026-04-28) extracted the CKAN fetch into `service/gnaf-package-fetch.js` and added `LOADER_USER_AGENT` (`service/gnaf-package-fetch.js:35`) to the `package_show` request. The fix predates this ticket's capture by three months — it was surfaced independently by the ADR-029 Phase 1 step 5 v2 populate failure (run 25032179791) one day after the reporter filed #458, and the two were never correlated because the 2026-07-29 capture pass did not cross-check the code.

Behavioural coverage: three tests in `test/js/__tests__/gnaf-package-fetch.test.mjs` (UA sent on cache miss, cache-hit short-circuit, stale-cache fallback).

### Investigation Tasks

- [x] Capture the loader's exact outbound request to data.gov.au (URL, User-Agent, headers, TLS version). — Two hops: the CKAN `package_show` metadata fetch (`service/gnaf-package-fetch.js`, sends `LOADER_USER_AGENT`) and the ZIP download (`utils/stream-down.js`, sends no User-Agent).
- [x] Reproduce the 403 and bisect what makes it pass. — Bisected 2026-04-28 (no UA → 403, Mozilla-prefixed UA → 200). Re-verified live from AU 2026-07-29, recorded under Verification Evidence below.
- [x] Decide the fix: send an accepted User-Agent/header. — Shipped in `741fd21`; released v2.4.3.
- [ ] Add a smoke check that the download URL responds 200 (guards against silent re-breakage). — **Not done.** Carried out of this ticket as a residual; see Residual Gaps.

### Verification Evidence

Live probe from AU, 2026-07-29:

| Probe                                                             | Result                                      |
| ----------------------------------------------------------------- | ------------------------------------------- |
| `HEAD https://data.gov.au`                                        | 200 — the reporter's 403 does not reproduce |
| CKAN `package_show`, no User-Agent                                | 200                                         |
| CKAN `package_show`, `LOADER_USER_AGENT`                          | 200                                         |
| G-NAF ZIP range request; UA empty / `node` / `undici` / loader UA | 206 on all four                             |

The WAF rule appears to no longer reject bare-UA requests from this vantage point, so the shipped User-Agent is currently belt-and-braces rather than load-bearing. It stays: the upstream policy is outside our control and reinstatement is free to happen again.

### Residual Gaps

Neither is currently breaking; both are latent and carried out of this ticket rather than fixed under it.

1. `utils/stream-down.js` sends no User-Agent on the ZIP download hop — the same exposure the CKAN hop had before `741fd21`. Verified serving 206 today regardless of UA.
2. The download-URL 200 smoke check (investigation task 4) was never implemented, so silent re-breakage of either hop would again be discovered only by a failing load.

## Fix Strategy

Send a User-Agent data.gov.au's CloudFront WAF accepts on the CKAN `package_show` request. Shipped 2026-04-28 in `741fd21` as `LOADER_USER_AGENT`.

**Release vehicle**: .changeset/fix-loader-user-agent.md

## Fix Released

**Released in `@mountainpass/addressr@2.4.3`** — changeset `.changeset/fix-loader-user-agent.md`, version-packages commit `957cb1a`, PR [#462](https://github.com/mountain-pass/addressr/pull/462), merge commit `3d52cdd`, released 2026-04-28. Present in the current published `@mountainpass/addressr@3.0.3`.

`LOADER_USER_AGENT` is sent on the data.gov.au CKAN `package_show` request, so the WAF no longer returns the 403 HTML error page that broke the loader's `JSON.parse`.

Verified 2026-07-29 by live probe (see Verification Evidence above) — all fetch paths healthy, reporter's symptom does not reproduce.

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: (none)

## Related

- Sibling loader tickets P012, P013, P034, P037 (title-keyword overlap on "loader"; none concern the data.gov.au download path — no merge).

## Reported Upstream

- **Origin issue**: https://github.com/mountain-pass/addressr/issues/458 (external reporter)
- **Acknowledged**: 2026-07-29 — cross-referenced the upstream cause and the cached-archive workaround (comment `5109831420`). That acknowledgement told the reporter we would "look at what the loader needs to do differently"; the fix had already shipped three months earlier, so the comment overstated the remaining work. Corrected in the closing verdict below.

## Upstream Lifecycle Updates

- **2026-07-29** — Open → Closed (inbound)
  - **Target**: inbound #458 (own repo `mountain-pass/addressr`)
  - **Comment URL**: https://github.com/mountain-pass/addressr/issues/458#issuecomment-5114759502
  - **Disclosure path**: posted-inbound-comment-and-closed
  - **Gate verdict**: external-comms PASS (no Confidential Information class matched) + voice-tone PASS on the second draft. The first draft FAILed voice-tone on a double-thanks sign-off exceeding the guide's single-opening-thanks ceiling; redrafted to one opening thanks with `@thirdwheel` credited in the factual register instead of the gratitude register.
  - **Idempotency guard**: no prior comment on #458 matched the `@mountainpass/addressr@2.4.3` verdict marker, so this was a first post.
