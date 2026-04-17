# Problem 020: Orphan `test/js/*.test.js` — no npm script runs them

**Status**: Open
**Reported**: 2026-04-18
**Priority**: 3 (Low) — Impact: Negligible (1) x Likelihood: Possible (3)

## Description

Two node:test-style test files exist under `test/js/`:

- `test/js/proxy-auth.test.js` — ADR 024 unit tests for proxy-auth middleware.
- `test/js/locality-search.test.js` — locality search unit tests.

Neither is invoked by any npm script. `package.json` has `test:mcp:smoke` and `test:precommit` for other `node --test` files, but no script runs `test/js/*.test.js`. Cucumber loads them via `--require test/js/**/*.js` in `cucumber.js`, but node:test's `describe`/`it` calls register with a runner that cucumber does not invoke — so the tests are effectively dead code in the cucumber run.

This was flagged by the architect review during P017 investigation when proposing a new `node --test` file for HATEOAS root-link-header assertions.

## Symptoms

- Adding a new `test/js/*.test.js` file runs locally via `node --test <file>` but contributes nothing to `npm test` or CI.
- Test coverage appears to exist but is not exercised — developers may assume the tests gate regressions.
- No CI signal for regressions in code covered by these tests (e.g., an ADR 024 regression in `proxy-auth.js` would pass CI despite the existing unit tests).

## Workaround

- Run manually: `node --test test/js/proxy-auth.test.js` etc.
- Rely on cucumber feature tests (`test/resources/features/proxy-auth-enforcement.feature`) for integration-level coverage.

## Impact Assessment

- **Who is affected**: Addressr Contributor / Maintainer persona — developers assuming the tests run.
- **Frequency**: Gap applies to every PR and every release.
- **Severity**: Low — integration-level cucumber coverage mitigates; direct unit-test gaps only affect narrow regressions that cucumber doesn't trigger.
- **Analytics**: N/A.

## Root Cause Analysis

### Finding

`package.json` lines 109-110 run `node --test` for `test/mcp/smoke.test.mjs` and `test/precommit/*.test.mjs` but not for `test/js/*.test.js`. No script references `test/js/**/*.test.js`.

### Fix Strategy (proposed)

Add a script: `"test:js": "node --test test/js/**/*.test.js"` (shell glob expansion — see BRIEFING.md note about `node --test test/precommit/` being interpreted as a CJS specifier).

Wire it into:

- `pre-commit` script alongside the existing lint + license + not-cli2-tags checks, OR
- A new step in the release workflow, OR
- The top-level `test` composite.

Pre-commit is the lightest-touch option — runs only when commits land, gives developers immediate feedback, doesn't bloat CI.

## Investigation Tasks

- [ ] Inventory all `test/js/**/*.test.js` — confirm the shell glob captures every intended file.
- [ ] Add `test:js` script. Verify it runs the two existing files successfully.
- [ ] Decide wiring: pre-commit, CI, or composite `test`.
- [ ] Document the convention in an ADR or update to ADR 009 (cucumber BDD testing) noting the `node --test` complement.
- [ ] Consider whether a new ADR is warranted — architect flagged this as "the second file of this style would warrant an ADR" when reviewing P017's investigation test plan.

## Related

- [P017: RapidAPI root missing postcode/locality/state rels](017-rapidapi-root-missing-postcode-locality-state-rels.closed.md) — architect review during this investigation raised the orphan-test concern.
- [P019: No deploy-time smoke check for root Link header rel completeness](019-missing-root-link-header-smoke-assertion.open.md) — overlaps if the smoke probe is implemented as a node-test file.
- ADR 009: Cucumber BDD testing.
- `test/js/proxy-auth.test.js`, `test/js/locality-search.test.js` — the orphans.
- `package.json:109-110` — the existing `node --test` scripts to mirror.
