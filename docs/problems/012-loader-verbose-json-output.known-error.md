# Problem 012: G-NAF loader dumps full JSON address documents to CI logs

**Status**: Known Error
**Reported**: 2026-04-16
**Priority**: 4 (Low) — Impact: Minor (2) x Likelihood: Unlikely (2)

## Description

The per-state G-NAF reindex workflows (`update-*.yml`) produce vast quantities of output — full JSON address documents — instead of simple progress indicators. The CI log for a single state reindex (e.g. QLD) grows to tens of thousands of lines of serialised address objects, making the log unusable for diagnosing actual failures.

## Symptoms

- GitHub Actions log for `update-qld.yml` (run 24486306665) shows full JSON objects including `sla`, `ssla`, `structured`, `geocoding` fields for every ~1% of addresses indexed.
- Log is dominated by address data rather than meaningful progress signals.
- Actual errors or warnings are buried in noise.

## Workaround

Logs are still functional — the workflow completes correctly. The output is cosmetic/operational, not a correctness issue. No immediate workaround needed beyond scrolling past the noise.

## Impact Assessment

- **Who is affected**: Contributor/Maintainer persona — anyone reviewing CI logs during a reindex.
- **Frequency**: Every G-NAF reindex run (scheduled quarterly per state, plus manual `workflow_dispatch` triggers).
- **Severity**: Low — operational annoyance, not a functional defect.
- **Analytics**: N/A

## Root Cause Analysis

### Confirmed Root Cause

`service/address-service.js:790-799` in `mapAddressDetails`:

```js
if (count) {
  if (index % Math.ceil(count / 100) === 0) {
    logger('addr', JSON.stringify(rval, undefined, 2)); // ← full JSON dump
    logger(`${(index / count) * 100}%`); // ← useful progress
  }
} else {
  if (index % 10_000 === 0) {
    logger('addr', JSON.stringify(rval, undefined, 2)); // ← full JSON dump
    logger(`${index} rows`); // ← useful progress
  }
}
```

`logger` is `debug('api')`. The reindex workflow sets `DEBUG=error,api,express:*,swagger-tools*,test,es` (`.github/workflows/reusable-update.yml:37`), which enables the `api` namespace. Every 1% of addresses (or every 10,000 rows when count is unknown), the full address object is serialised to stdout.

For a state like QLD with ~2M addresses, that's ~2,000 full JSON dumps × ~30 lines each = ~60,000 lines of noise per state.

### Investigation Tasks

- [x] Locate the verbose output source (`service/address-service.js:790-799`)
- [x] Confirm the debug namespace enabling it (`DEBUG=...api...` in workflow env)
- [ ] Create reproduction test
- [ ] Implement fix

## Fix Strategy

Two options (both simple):

1. **Remove the JSON dump lines** (lines 792, 797) — keep only the `%` / `rows` progress lines. The full JSON was useful during initial development but adds no diagnostic value in CI.
2. **Change the debug namespace** — use a separate `debug('loader')` namespace for the JSON dumps and don't enable it in the workflow. Keep `api` for request/response logging only.

Option 1 is the simpler fix (~2 line deletions). Option 2 preserves the ability to opt in to verbose output locally via `DEBUG=loader`.

## Related

- Observed during the P007 production reindex (run 24486306665, `update-qld.yml`)
- `.github/workflows/reusable-update.yml:37` — DEBUG env var
- `service/address-service.js:790-799` — verbose logger calls
