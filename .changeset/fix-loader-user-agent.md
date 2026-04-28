---
'@mountainpass/addressr': patch
---

Fix: data.gov.au's CloudFront WAF blocks the loader's bare `fetch()` (no User-Agent) with HTTP 403, breaking G-NAF refreshes. Confirmed via curl 2026-04-28: same URL with no UA → 403; with `Mozilla/5.0 (compatible; addressr-loader; +https://github.com/mountain-pass/addressr)` → 200.

The fetch + cache helper has been extracted from `service/address-service.js` into `service/gnaf-package-fetch.js` so it's testable in raw Node ESM (the host file uses babel-only bare imports). Now sends `LOADER_USER_AGENT` on every CKAN call. Behavioural tests added at `test/js/__tests__/gnaf-package-fetch.test.mjs` exercise cache miss / cache hit / stale-on-failure paths. No functional change other than the header.

Surfaced by ADR 029 Phase 1 step 5 v2 populate (run 25032179791) and would equally have broken the next quarterly v1 cron (last v1 update succeeded 2026-04-16). Refs P028, ADR 029, P033 (source-inspection anti-pattern).
