# Problem 033: Source-inspection tests are an anti-pattern in this codebase

**Status**: Open
**Reported**: 2026-04-28
**Priority**: 6 (Medium) — Impact: Moderate (3) x Likelihood: Possible (2)

## Description

`test/js/__tests__/address-service.test.mjs` and other test files in this directory follow a **source-inspection** style: they `readFile()` the implementation source and `assert.match()` regex patterns against the source text rather than calling the implementation and asserting on its observable behaviour.

Examples currently in tree (`test/js/__tests__/address-service.test.mjs`):

- "mapAddressDetails does not JSON.stringify the address in progress logging" — greps `JSON.stringify(rval` out of the source.
- "fuzziness MUST be `AUTO:5,8`" — greps `fuzziness: "AUTO:5,8"` out of the source.
- "imports expandRangeAliases from ./range-expansion" — greps the import statement.
- "attaches rval.sla_range_expanded using expandRangeAliases" — greps the assignment expression.

These tests **pin the literal source text**, not the contract. Failure modes:

1. **False green**: a refactor that preserves behaviour but changes naming/syntax (e.g. a different fuzziness shape that produces the same query, or a renamed local variable) breaks the test even though the contract is intact.
2. **False green inverse**: a behavioural regression that doesn't change the source pattern (e.g. the search execution path skipping the fuzziness clause entirely under some condition) passes the test even though the contract is broken.
3. **No mocking**: real behavioural tests would import the function, mock its dependencies, call it, and assert on the result. Source-inspection skips that — the function is never executed.
4. **Reviewer trap**: the file path `test/js/__tests__/address-service.test.mjs` and the `describe()` titles imply behavioural coverage. A reviewer reading the test name would assume the contract is exercised. It isn't.

This problem was surfaced 2026-04-28 when authoring a User-Agent fix for `service/address-service.js`'s `fetchPackageData` (data.gov.au CKAN WAF compatibility, ADR 029 Phase 1 step 5 blocker). The natural shape — and the shape in line with all other tests in this file — was a source-inspection test asserting `User-Agent: LOADER_USER_AGENT` appears in the source. The user rejected this and explicitly asked for a behavioural test. The user is right; the existing pattern is the bug.

## Symptoms

- Tests pass when the implementation is structurally similar but behaviourally broken.
- Tests fail when the implementation is refactored to a different shape with identical behaviour.
- Coverage tools (`nyc` per `package.json`) cannot tell that the assertions don't execute the code under test.
- A maintainer copying the existing pattern for a new test ships another source-inspection test, compounding the problem.

## Workaround

For the immediate User-Agent fix in this same session: write a **behavioural test** — import `fetchPackageData`, mock `fetch`, call the function, assert the captured request had the User-Agent header. The fix's test does NOT follow the existing source-inspection pattern; it sets a precedent for what behavioural tests look like in this codebase.

For the existing tests: they continue to provide some value (they catch coarse-grained regressions like "the function is gone entirely") but should be progressively replaced with behavioural tests as the relevant code is touched.

## Impact Assessment

- **Who is affected**: Addressr Contributor/Maintainer (JTBD-400 — Ship releases reliably from trunk) — false-green tests undermine the trunk-based release determinism. Indirectly, end-user personas (J1/J3/J4) when a behavioural regression slips past tests that look like coverage but aren't.
- **Frequency**: continuous risk surface — every commit touching the implementations covered by source-inspection tests is exposed to false-green/false-red. The most-impacted files are `service/address-service.js` and `client/elasticsearch.js` (also has source-inspection tests).
- **Severity**: Moderate — production correctness depends on real behavioural coverage. The existing CI Cucumber suite catches integration-level regressions, so the source-inspection tests aren't the only line of defence; but they create maintainer friction and cognitive overhead.
- **Analytics**: N/A.

## Root Cause Analysis

### Why we have source-inspection tests

The pattern was likely introduced as a quick way to assert "this regex appears in the source" without spinning up a test runner that exercises addressr-server + OpenSearch. It's faster to write than a behavioural test, runs in milliseconds, and looks like it's testing the contract.

The file path `test/js/__tests__/address-service.test.mjs` is consistent with a JS test convention (`__tests__` directory, `.test.mjs` naming) which carries Jest-style behavioural-test connotations. Reviewers/contributors copying the pattern reasonably assume the existing tests are behavioural and follow suit.

### Investigation Tasks

- [ ] Audit all `test/js/__tests__/*.test.mjs` files. Catalog which assertions are source-inspection vs behavioural.
- [ ] Decide a refactor cadence: replace opportunistically when touching the relevant implementation, OR a single sweep.
- [ ] Document the convention in `AGENTS.md` or a new `test/js/__tests__/README.md`: "Tests in this directory MUST exercise the implementation and assert on observable behaviour. Source-inspection tests (assert.match against source text) are forbidden — see P033."
- [ ] Add a lint rule or CI check that catches `readFile(.*service/.*\.js.*)` followed by `assert.match` patterns and flags them as source-inspection.

## Related

- Surfaced during ADR 029 Phase 1 step 5 fix-forward for the data.gov.au CKAN WAF compatibility (User-Agent header missing on `fetch()`).
- ADR 014 (governance commits) — tests should be a meaningful gate, not a ceremonial pass.
- JTBD-400 (Ship releases reliably from trunk) — false-green tests undermine the release determinism the job asserts.
