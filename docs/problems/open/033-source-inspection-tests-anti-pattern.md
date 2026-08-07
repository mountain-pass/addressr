# Problem 033: Source-inspection tests are an anti-pattern in this codebase

**Status**: Open
**Reported**: 2026-04-28
**Priority**: 16 (High) — Impact: Significant (4) × Likelihood: Likely (4). **Re-rated 2026-08-08 on confirmed evidence, not on judgement.** Impact 4: this ticket's own failure mode 2 hid a production defect for four months, and that defect falsified two ADRs and the closure of a problem ticket — the harm is to the trustworthiness of the record, not just to a code path. Likelihood 4: no longer hypothetical. It has fired once, demonstrably, on the exact example this ticket names in its Description; **34 further source-inspection assertions remain** across four files, so the population that can fire again is enumerated below.
**Origin**: internal
**Effort**: M — audit of test/js/**tests** assertions + progressive behavioural-test replacement cadence
**WSJF**: 8.0 — (16 × 1.0) / 2 — re-rated 2026-08-08 on the P091 evidence; was 3.0 (6 × 1.0) / 2, backfilled 2026-07-29 (review)

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

## CONFIRMED INSTANCE — 2026-08-08, and it is this ticket's own worked example

**This ticket predicted a specific defect by name and then that defect happened.** The Description above lists, as an illustration, _"attaches rval.sla_range_expanded using expandRangeAliases — greps the assignment expression"_. Failure mode 2 above reads: _"a behavioural regression that doesn't change the source pattern passes the test even though the contract is broken."_

That is precisely what occurred. See [P091](091-sla-range-expanded-indexed-at-wrong-path-never-searchable.md).

`sla_range_expanded` has been indexed one level too deep — at `_source.structured.sla_range_expanded` rather than the top-level path the mapping declares and every query targeted — since **2026-04-20**, eight days before this ticket was filed. Measured against production 2026-08-08: the field is populated on **0 of 16,905,824** documents, while **349,540** range-form documents should carry it.

Three layers of tests were green throughout:

| instrument                          | what it asserted                                                                    | why it passed                                                                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `address-service.test.mjs`          | `/rval\.sla_range_expanded\s*=\s*expandRangeAliases\(/` **against the source text** | The assignment does exist. The source is correct; the _assembly site downstream of it_ is not.                                           |
| `elasticsearch.test.mjs`            | the mapping **declares** the field                                                  | It does. Declaration is not population.                                                                                                  |
| ADR-028 Cucumber endpoint scenarios | endpoint recall for `103` / `107 GAZE RD`                                           | Recall is carried by the whitecomma tokenizer split, so they pass identically with the field absent — which is what they had been doing. |

**No test at any level asserted that a range document is retrievable by its alias.** The one assertion that named the feature was the source-inspection regex, and it is structurally incapable of detecting the defect: the code it greps for is present and correct.

The cost was not a wrong number in a test report. It was four months during which [ADR-026](../../decisions/026-range-number-address-expansion.superseded.md) and [ADR-028](../../decisions/028-range-number-endpoint-only.proposed.md) recorded an index-side mechanism as working when it had never executed, [P015](../closed/015-range-number-addresses-not-searchable-by-base-number.md) was closed on it, and [P075](075-adr041-inverts-exact-vs-range-on-one-address.md) attributed a live ranking inversion to an alias that is not in the index.

### The population that can still fire

Enumerated 2026-08-08 — `assert.match()` over implementation source text:

| file                                           | assertions |
| ---------------------------------------------- | ---------- |
| `test/js/__tests__/waycharter-server.test.mjs` | 14         |
| `test/js/__tests__/address-service.test.mjs`   | 7          |
| `test/js/__tests__/proxy-auth.test.mjs`        | 7          |
| `test/js/__tests__/graceful-shutdown.test.mjs` | 6          |
| **total**                                      | **34**     |

Each is a claim of coverage that executes no code. `proxy-auth.test.mjs` is the one to look at first: ADR-024 proxy authentication is a security boundary, and a source-inspection assertion there is a green light over an unexercised auth path.

### What "replace" has to mean

Deleting these tests is not the fix, and neither is rewriting them one-for-one. The replacement must assert the **observable outcome** — for P091 that means indexing a range document and searching for it by its alias, which fails against today's code and is the test that should have existed since April. A behavioural test that stops at "the function returned the right object" would also have missed this, because `mapAddressDetails` **did** return the right object; the loss happened at the assembly site downstream. The invariant worth pinning is end-to-end: _what goes into the index is what the query can find_.

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

- [P091](091-sla-range-expanded-indexed-at-wrong-path-never-searchable.md) — the confirmed instance. This ticket's failure mode 2, on this ticket's own named example, costing four months.

- Surfaced during ADR 029 Phase 1 step 5 fix-forward for the data.gov.au CKAN WAF compatibility (User-Agent header missing on `fetch()`).
- ADR 014 (governance commits) — tests should be a meaningful gate, not a ceremonial pass.
- JTBD-400 (Ship releases reliably from trunk) — false-green tests undermine the release determinism the job asserts.
