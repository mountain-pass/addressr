# Problem 068: G-NAF loader fails with CloudFront 403 from data.gov.au

**Status**: Open
**Reported**: 2026-07-29
**Origin**: inbound-reported (#458)
**Priority**: 16 (High) — Impact: Significant (4) × Likelihood: Likely (4) — derived at capture from the description per Step 4a. Impact 4 per RISK-POLICY § Impact: the self-hosted npm/Docker loader fails a subset of operations (it cannot download G-NAF, so fresh installs and re-indexing are blocked); the already-indexed live RapidAPI service is unaffected. Likelihood 4: an external user reproduced it (`curl -I https://data.gov.au` → 403) and reports it failing consistently for weeks, so it is a confirmed, currently-active failure mode (ADR-076 inbound-report evidence — honest field risk, not a rank lever).
**Effort**: M — derived at capture: investigate what the loader's HTTP request sends vs what data.gov.au's CDN now requires (User-Agent, TLS, geo/rate policy), then adapt the download (headers, source URL, or a mirror). Single subsystem (loader download path) — cf. P034 (loader fix, M-ish).
**WSJF**: 8.0 — (16 × 1.0) / 2
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

### Preliminary Hypothesis

The 403 originates from data.gov.au's own CloudFront distribution, not from addressr code — the CDN has started refusing requests it previously served. The "worked previously, fails now with no addressr change" shape points to an upstream policy change: a new bot/User-Agent block, a geo/rate restriction, a TLS-version requirement, or the dataset URL having moved behind a different access path.

### Investigation Tasks

- [ ] Capture the loader's exact outbound request to data.gov.au (URL, User-Agent, headers, TLS version).
- [ ] Reproduce the 403 and bisect what makes it pass — a browser User-Agent, a different endpoint, or the current documented G-NAF distribution URL on data.gov.au.
- [ ] Decide the fix: send an accepted User-Agent/header, follow the moved source URL, or document a mirror/cached-archive path as the supported route.
- [ ] Add a smoke check that the download URL responds 200 (guards against silent re-breakage).

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: (none)

## Related

- Sibling loader tickets P012, P013, P034, P037 (title-keyword overlap on "loader"; none concern the data.gov.au download path — no merge).

## Reported Upstream

- **Origin issue**: https://github.com/mountain-pass/addressr/issues/458 (external reporter)
- **Acknowledged**: 2026-07-29 — cross-referenced the upstream cause and the cached-archive workaround (comment `5109831420`).
