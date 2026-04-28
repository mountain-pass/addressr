# Problem 034: addressr-loader's COVERED_STATES filter is case-sensitive (silent zero-doc indexing)

**Status**: Open
**Reported**: 2026-04-28
**Priority**: 6 (Medium) — Impact: Moderate (3) x Likelihood: Possible (2)

## Description

`service/address-service.js:1336-1341` filters the per-state G-NAF detail files via:

```js
const filesToCount =
  COVERED_STATES.length > 0
    ? files.filter(
        (f) =>
          f.match(/Authority/) ||
          COVERED_STATES.some((s) => path.basename(f).startsWith(`${s}_`)),
      )
    : files;
```

The match is **case-sensitive** against G-NAF's uppercase filenames (`OT_ADDRESS_DETAIL_psv.psv`, `NSW_ADDRESS_DETAIL_psv.psv`, etc.). A lowercase or mixed-case `COVERED_STATES` env value (e.g. `ot`, `Nsw`) produces an empty filtered list, the loader skips the address-indexing pass entirely, and the run completes with **zero documents** — silently. The localities pass and "data loaded" log line still emit, so the run looks successful from the workflow log.

## Symptoms

- Loader exits with code 0 and "Fin" message.
- `addressr` index is created but contains 0 docs.
- `addressr-localities` index is created but contains 0 docs.
- Total runtime is dramatically shorter than a real load (e.g. ~1s extraction + indexing locally vs ~12 minutes per state for a real OT load on CI).
- No error log line distinguishes the empty-filter case from a real successful load.

## Workaround

Pass `COVERED_STATES` in **uppercase** matching the G-NAF dataset's file naming convention. The 9 existing `update-{state}.yml` workflows already do this (e.g. `update-ot.yml` passes `state: OT` → reusable-update.yml sets `COVERED_STATES=OT`).

`.github/workflows/populate-search-domain.yml` was emitting lowercase before commit XXXXXXX (this session). It now uppercases both the hardcoded `all` list and the comma-separated input.

## Impact Assessment

- **Who is affected**: Addressr Contributor/Maintainer (JTBD-400 — Ship releases reliably from trunk) primary. Indirectly J1 / J3 / J4 / J5 if a quarterly G-NAF refresh ships with a lowercase state code and the addressr index empties out.
- **Frequency**: rare — current callers all pass uppercase. The trap fires when a NEW caller is introduced (a Docker compose, a custom orchestrator, a manually-typed env var). populate-search-domain.yml fired this trap in this session.
- **Severity**: Moderate — silent data loss is the worst class of failure mode. A noisy failure (loader exits non-zero, error logs) would be far less damaging because operators would notice. Today the loader claims success.

## Root Cause Analysis

### Why the filter is case-sensitive

JavaScript's `String.prototype.startsWith` is case-sensitive. The author of `service/address-service.js:1340` matched the literal G-NAF filename convention without normalising. There's no `--ignore-case` flag or upper-case coercion at the consumer side.

### Why it was never caught

The 9 `update-{state}.yml` workflows hardcode uppercase state codes. The cucumber CI test fixture uses `OT_*` files directly (uppercase). No test exercises the lowercase path.

### Investigation Tasks

- [ ] Add a defensive normalisation at `service/address-service.js`'s COVERED_STATES parser: `process.env.COVERED_STATES.split(',').map(s => s.trim().toUpperCase())`.
- [ ] Add a behavioural test (NOT source-inspection per P033) that passes lowercase `ot` to the parser and asserts the resulting filter still matches `OT_ADDRESS_DETAIL_psv.psv`.
- [ ] Consider also failing loud if the filtered file list is empty: `throw new Error('COVERED_STATES filter matched zero G-NAF files; check spelling/case')`. Better to fail fast than ship 0 docs silently.
- [ ] Once landed, simplify populate-search-domain.yml's matrix to lowercase if preferred (only needed if the loader normalises; currently uppercase is the workaround).

## Related

- Surfaced 2026-04-28 by ADR 029 Phase 1 step 5 v2 populate (run 25033129925) which "succeeded" with 0 docs across all 9 matrix legs. Reproduced locally with `COVERED_STATES=ot` (1.6s, 0 docs) vs `COVERED_STATES=OT` (1.6s, 5186 addresses + 15 localities — OT is tiny).
- Related to P033 (source-inspection tests anti-pattern) — no behavioural test caught this, only a behavioural test will.
- Workaround landed in commit XXXXXXX (uppercase fix in populate-search-domain.yml).
