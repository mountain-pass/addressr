# Problem 020: Orphan `test/js/*.test.js` — no npm script runs them

**Status**: Known Error
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

- [x] Inventory all `test/js/**/*.test.js` — architect review identified a third orphan (`steps.test.js`) on 2026-04-19.
- [x] Add `test:js` script. Already exists (`node --test test/js/__tests__/*.test.mjs`); orphans moved into that glob.
- [x] Decide wiring: pre-commit (already wired — runs as part of `npm run pre-commit`).
- [ ] Document the convention in an ADR or update to ADR 009 (cucumber BDD testing) noting the `node --test` complement. **Deferred** — see Follow-up.
- [x] Consider whether a new ADR is warranted — architect (2026-04-19) recommended at minimum an ADR-009 amendment. See Follow-up.

## Fix Released

**Date**: 2026-04-19

Two of the three orphan test files moved from `test/js/` to `test/js/__tests__/` with extension change `.test.js` → `.test.mjs` to match the existing working pattern (`waycharter-server.test.mjs`):

- `test/js/proxy-auth.test.mjs` — ADR 024 proxy-auth middleware unit tests. Runs `validateProxyAuthConfig` (4 tests) and `proxyAuthMiddleware` (6 tests). All pass. Relative import path updated to `../../../src/proxy-auth.js`.
- `test/js/__tests__/steps.test.mjs` — TDD gate placeholder. Passes.

`npm run test:js` now runs 12 tests across 4 suites (up from 1 test / 1 suite). The test:js step fires as part of the pre-commit hook (see `.husky/pre-commit` → `package.json` `pre-commit` script).

Not moved: `test/js/locality-search.test.js` remains in place (still dead). Moving it into the active glob exposed a pre-existing import resolution failure in `service/address-service.js:18` (`from '../client/elasticsearch'` — missing `.js` extension, relies on Babel transpilation). Running those tests under stock `node --test` fails because node's ESM resolver requires explicit extensions; the wider fix touches the `service/` barrel imports and is out-of-scope for this ticket. Kept as an orphan until the scope-expanded fix lands.

## Follow-up

- **ADR-009 amendment** — architect recommended a short amendment to ADR-009 declaring the node:test complement: convention is `test/*/__tests__/*.test.mjs`, `.mjs` extension keeps cucumber's `test/js/**/*.js` require-glob from loading them. Deferred to avoid scope-creeping this ticket.
- **locality-search tests** — the pre-existing Babel-dependent imports in `service/address-service.js` block locality-search tests from running under stock `node --test`. Two fix paths: (a) add `.js` extensions to all `service/` and `client/` barrel imports; (b) run the test with `--import @babel/register` or equivalent. Neither fits the S-effort scope that was originally estimated for P020.

## Related

- [P017: RapidAPI root missing postcode/locality/state rels](017-rapidapi-root-missing-postcode-locality-state-rels.closed.md) — architect review during this investigation raised the orphan-test concern.
- [P019: No deploy-time smoke check for root Link header rel completeness](019-missing-root-link-header-smoke-assertion.open.md) — overlaps if the smoke probe is implemented as a node-test file.
- ADR 009: Cucumber BDD testing.
- `test/js/proxy-auth.test.js`, `test/js/locality-search.test.js` — the orphans.
- `package.json:109-110` — the existing `node --test` scripts to mirror.
