# Problem 089: No file-length lint rule, so two source files have grown past 1000 lines

**Status**: Open
**Reported**: 2026-08-07
**Priority**: 4 (Low) — Impact: Minor (2) × Likelihood: Possible (3) — derived at capture. Impact 2 per [RISK-POLICY](../../../RISK-POLICY.md) § Impact level 2: developer-experience only, with no user-facing or runtime effect. The cost is navigation, review quality and the size of the blast radius when a file this large is edited. Likelihood 3: growth is the default direction for a file with no ceiling, and it has already happened twice.
**Origin**: internal
**Effort**: S — derived at capture: one rule in `eslint.config.js`, set to `warn` to match the existing size rules, plus a threshold decision. Splitting the two offending files is separate and larger work, deliberately not in scope here.
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

`eslint.config.js` configures four size and shape limits, and every one of them is **function-scoped**:

| Rule                     | Setting                                    |
| ------------------------ | ------------------------------------------ |
| `max-lines-per-function` | `warn`, max 100 (skip blanks and comments) |
| `complexity`             | `warn`                                     |
| `max-depth`              | `warn`, 4                                  |
| `max-params`             | `warn`, 4                                  |

There is no `max-lines`, so nothing bounds a **file**. Measured 2026-08-07 across `service/`, `src/`, `client/` and `utils/`:

| Lines | File                         |
| ----- | ---------------------------- |
| 1896  | `service/address-service.js` |
| 1032  | `src/waycharter-server.js`   |
| 393   | `src/init-index-config.js`   |
| 328   | `src/read-shadow.js`         |
| 271   | `client/elasticsearch.js`    |
| ≤ 162 | everything else              |

Two outliers, then a cliff. The gap between second and third place is roughly 2.6x, so a threshold that catches the two would leave every other first-party source file untouched.

Raised by the maintainer 2026-08-07 while landing the query-body extraction, on observing that `service/address-service.js` is ~1900 lines.

## Symptoms

- `service/address-service.js` holds the loader, the G-NAF mapping, the search query path, the response mapping and several error paths in one file, so an edit to any one of them is reviewed against all of them.
- The file is the single largest concentration of the lint debt recorded in [P084 ESLint 10 and unicorn 72 leave a deliberate lint debt with no CI gate](084-eslint-10-and-unicorn-72-leave-a-deliberate-lint-debt-with-no-ci-gate.md): 23 of its errors are now suppressed by a scoped `eslint-disable` block precisely because its size makes clearing them a large piece of work.
- Nothing signals when a file crosses a size worth splitting, so the growth is only ever noticed by eye.

## Workaround

Notice it manually, as happened here.

## Impact Assessment

- **Who is affected**: the maintainer, and any contributor reading or reviewing these two files.
- **Frequency**: on every edit to either file.
- **Severity**: Minor. No runtime, publish or consumer effect. The real cost is compounding: large files attract more code, resist extraction, and make review coarser.
- **Analytics**: N/A.

## Root Cause Analysis

### Preliminary observation

The rule set was chosen at function granularity and file granularity was never added. There is no evidence this was a deliberate exclusion rather than an omission. Note that `max-lines-per-function` at 100 has not prevented the file growing to 1896 lines, because a file can hold any number of compliant functions.

### Investigation Tasks

- [ ] Investigate root cause: confirm whether file-level limits were considered and rejected, or simply never configured
- [ ] Pick a threshold. The measured distribution suggests something in the 400 to 600 range flags exactly the two outliers and nothing else. Decide whether to count blank lines and comments (the existing `max-lines-per-function` skips both)
- [ ] Decide severity. `warn` matches every other size rule in the config and does not block commits; `error` would immediately block all work on both files, which is the failure mode P084 has just demonstrated
- [ ] Decide whether the two existing offenders are grandfathered or scheduled for a split, and if scheduled, capture that as separate work

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: [P084 ESLint 10 and unicorn 72 leave a deliberate lint debt with no CI gate](084-eslint-10-and-unicorn-72-leave-a-deliberate-lint-debt-with-no-ci-gate.md) — the same config surface, and P084's severity is amplified by the file size this ticket is about.

## Related

Captured via `/wr-itil:capture-problem` on maintainer prompt.

- [P084 ESLint 10 and unicorn 72 leave a deliberate lint debt with no CI gate](084-eslint-10-and-unicorn-72-leave-a-deliberate-lint-debt-with-no-ci-gate.md) — the lint-debt ticket; its worst concentration is in the largest file here.
- [P033 Source-inspection tests are an anti-pattern in this codebase](../known-error/033-source-inspection-tests-anti-pattern.md) — `service/address-service.js` being babel-only and very large is why its tests were written as source regexes; the 2026-08-07 extraction of the query body to `src/build-search-body.js` is the shape a split would take.
- `eslint.config.js` lines 103 to 109 — the four existing function-scoped size rules.
