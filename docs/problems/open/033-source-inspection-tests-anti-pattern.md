# Problem 033: Source-inspection tests are an anti-pattern in this codebase

**Status**: Open
**Reported**: 2026-04-28
**Priority**: 16 (High) — Impact: Significant (4) × Likelihood: Likely (4). **Re-rated 2026-08-08 on confirmed evidence, not on judgement.** Impact 4: this ticket's own failure mode 2 hid a production defect for four months, and that defect falsified two ADRs and the closure of a problem ticket — the harm is to the trustworthiness of the record, not just to a code path. Likelihood 4: no longer hypothetical. It has fired once, demonstrably, on the exact example this ticket names in its Description; a population of further source-inspection assertions remains, enumerated in the Remaining population table below — **34 across four files at the time of this re-rating**, since reduced by the conversions recorded under Resolution. The rating is set against the re-rating-date figure and is not re-derived on every conversion; see that table for the live count.
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

Each of these is a claim of coverage that executes no code. **The live count lives in exactly one place — the Remaining population table below** — and this section deliberately does not restate it. Two tables of the same fact is how this ticket came to say 7 and 14 for the same file twenty lines apart; the unit of a correction is the claim, not the locality.

The count at re-rating time, 2026-08-08, was **34 across four files**, which is what the Likelihood-4 rating was set against. That figure is a historical anchor for the rating, not a current measurement. One of its rows was wrong when written: `proxy-auth.test.mjs` was counted at 7 by grepping `assert.match` without separating behavioural matches from source matches — the true figure is 2, and the retraction is recorded below.

`proxy-auth.test.mjs` is still the one to look at first regardless of its size: ADR-024 proxy authentication is a security boundary, and a source-inspection assertion there is a green light over an unexercised auth path.

### What "replace" has to mean

Deleting these tests is not the fix, and neither is rewriting them one-for-one. The replacement must assert the **observable outcome** — for P091 that means indexing a range document and searching for it by its alias, which fails against today's code and is the test that should have existed since April. A behavioural test that stops at "the function returned the right object" would also have missed this, because `mapAddressDetails` **did** return the right object; the loss happened at the assembly site downstream. The invariant worth pinning is end-to-end: _what goes into the index is what the query can find_.

## First conversion landed 2026-08-08 — the `sla_range_expanded` block

Three of the assertions this ticket names by example are now behavioural. `attachRangeAliases` and `buildIndexedDocument` are extracted to `src/build-indexed-document.js` as clean ESM and covered by 11 executing assertions in `test/js/__tests__/build-indexed-document.test.mjs`. The `assert.match` count in `address-service.test.mjs` drops 7 → 5.

The extraction follows the path this repo already uses to escape the babel-only constraint that forced source-inspection in the first place: `src/build-search-body.js`, `src/init-index-config.js`, `service/gnaf-package-fetch.js` and `utils/stream-down.js` were all moved out for the same reason.

**Two findings from doing it, both of which sharpen this ticket's thesis.**

**1. The assertion was watching the wrong site.** The regex greps `mapAddressDetails` for `rval.sla_range_expanded = expandRangeAliases(`. It matched for four months while the field reached 0 of 16.9M documents ([P091](091-sla-range-expanded-indexed-at-wrong-path-never-searchable.md)), because the code it matches is **correct**. The defect is seventy lines away at the document-assembly site, which had no test of any kind. A test named after a feature was covering the half that worked, and its name is what made the other half look covered.

That is a sharper claim than the ticket's original framing. The risk is not only that a source regex can pass while behaviour is broken; it is that **naming a test after a feature transfers apparent coverage to every part of that feature**, including parts nothing touches.

**2. A dead function with an unexecutable defect.** `setAddresses` carried `const { sla, ssla, ...structurted } = row` — misspelled throughout — and `confidence: structurted.structurted.confidence`, which reads `.confidence` off `undefined`. It would throw a TypeError on first call. It never has: its only caller was the Cucumber step `Given('an address database with:')`, and no feature file uses that step. Both are deleted.

Worth noting what was NOT done and why. Routing the dead function through the shared assembly would have fixed the spelling of a crash rather than the crash — the step's input is externally-supplied JSON with no nested `structured` key, so `structured.structured.confidence` throws exactly as the misspelling does. Fixing it silently would have converted a loud dead path into a quiet apparently-live one, which is this ticket's failure mode in a different costume.

**Deliberately not done: the field's placement.** `buildIndexedDocument` reproduces today's shape byte-for-byte, and the new test **characterises** the defect rather than asserting a fix — it pins that `sla_range_expanded` currently lands under `structured`, names P091 as the owner, and does not say where it should go. P091's leading option on measurement is removal, not relocation, so asserting a target here would pre-empt a decision that ticket is holding open. Hoisting would also drop a field from `GET /addresses/{id}` and change the ETag on 349,540 range documents.

### Second conversion landed 2026-08-08 — the CORS preflight response

Six more regexes converted. `src/cors-preflight.js` carries the gating and the response shape; `test/js/__tests__/cors-preflight.test.mjs` covers them with ten executing assertions across eight cases. `waycharter-server.test.mjs` drops 14 → 7.

The retired regexes asserted that `src/waycharter-server.js` _contains_ `'Access-Control-Max-Age'`, contains `86400`, contains `status(204)`. Each would keep passing if the handler appended to the wrong response object, read the wrong environment variable, or emitted its headers after `end()`.

**Two properties are now pinned that no regex could distinguish**, and both are the kind of thing that reaches a browser:

- **`append` versus `set`.** The shipped code appends, so an upstream value survives. `set` would silently replace it. Both spellings contain the header name, so every regex matched either.
- **Header emission before `end()`.** Headers appended after the response ends never reach the client. A regex sees all three statements and cannot see their order.

**What deliberately stayed a regex.** The registration _order_ — `app.options` mounted ahead of `proxyAuthMiddleware`, so a preflight is answered before authentication — is a fact about `buildRest2App`'s statement order, not about the handler. `buildRest2App` cannot be imported by raw Node ESM: it transitively pulls `service/address-service` through a babel-only bare specifier. Source inspection is the honest instrument until that import is resolved, and the block now says so rather than implying the whole area is covered.

Live behaviour is separately covered by `test/resources/features/cors-preflight.feature` (5 scenarios, real HTTP through the auth chain). Verified rather than assumed: `cucumber-js -p default --dry-run --tags 'not(@not-nodejs) and not(@geo) and @not-rest2'` selects exactly those 5, and `@not-rest2` is unique to that file — so the 37-scenario default-profile run cited for this change did exercise the rewired handler end-to-end. Worth noting for this ticket's history: that file's absence was once asserted in a comment here as though it existed, leaving the text-matching guard as the only cover for the ADR-037 runtime behaviour.

**One assertion was written and then removed, and it belongs in this ticket's record because it is this ticket's own thesis.** The first draft exported `PREFLIGHT_METHOD = 'OPTIONS'` from `src/cors-preflight.js` and asserted it under the name _"answers only OPTIONS — a wider method would be an auth bypass"_. But `waycharter-server.js` registers via the literal `app.options` and never consumed the constant, so the assertion compared a literal to itself: it would have stayed green through the exact widening its name claimed to prevent. That is a source-inspection failure in a costume this ticket had not yet catalogued — not a regex, but an executing assertion over a value nothing wires to the system. Executing is necessary, not sufficient; the assertion has to be on a path the production code takes. The removal is recorded in a comment at the site so the next person does not re-add it.

### Third conversion landed 2026-08-08 — the server drain, and a lint suppression it deleted

Five more retired. `stopServer` and `forceCloseConnections` moved from `src/waycharter-server.js` into `src/graceful-shutdown.js`, joining the handlers that already call them, and `graceful-shutdown.test.mjs` drops 7 → 2.

The retired assertions read the function _body as text_: that it contains `Promise.resolve()`, contains `server.close((`, contains `closeIdleConnections()`, and `doesNotMatch(/reject/)`. That last one is the sharpest illustration this ticket has produced of why text is the wrong instrument — it fails on a variable named `rejectedCount`, and it passes on a promise that rejects through a helper. It was checking a spelling, on the path that decides whether an in-flight request is answered or dropped during a deploy.

Seven executing assertions replace them, including two properties the regexes could not express:

- **`close()` is requested BEFORE idle sockets are closed.** Reversed, a new connection can land in the gap. A regex sees both statements and not their order.
- **`stopServer` resolves — not rejects — when `close()` hands back an error.** The behavioural form of `doesNotMatch(/reject/)`. It runs the drain with a failing callback and asserts the promise settles fulfilled, which is the actual contract: `test/js/world.js` discards the return value, so a rejection there fails teardown.

**Extraction shape, and why it is a factory.** `createServerLifecycle()` closes over the handle and returns the three functions; a process-wide singleton is destructured from one call. Two things fall out. A test gets a genuinely independent handle by calling the factory again rather than defeating the module cache with a query-string import — the first draft did exactly that, and it is a smell. And **the singleton is a `const` initialised once, so `unicorn/no-top-level-assignment-in-function` stops firing**: the suppression granted against that rule on `waycharter-server.js:996` hours earlier is gone from the tree, removed rather than relocated. It was deferred on the grounds that the shutdown lifecycle had no unit cover to catch a mistake; landing the cover dissolved it. Recorded on P084 as the argument for sequencing that ticket behind this one.

**The extraction opened a coverage gap of exactly this ticket's own kind, and the risk gate caught it.** All seven new assertions build a fresh lifecycle via the factory — which is what makes them independent, and is also why, on their own, they prove nothing about the instance production runs. `server2.js` hands `installShutdownHandlers` the _singleton's_ functions and `startRest2Server` calls the _singleton's_ `trackServer`; if those ever stopped referring to one closure, all seven would still pass. Nothing executed the wiring.

The failure mode is what makes it worth an eighth case rather than a note. `stopServer()` on an untracked handle returns `Promise.resolve()` — a broken wiring does not throw and does not hang. It drains nothing, instantly, and exits 0. So the eighth case executes the exported singleton itself, and it is mutation-proved: splitting the export into two `createServerLifecycle()` calls fails that case and only that case.

**Two claims about test evidence were also wrong, and both are corrected here.** I cited the rest2 tier as proof the drain works because it binds a real listener. It could not have been: `test/js/world.js`'s `AfterAll` called `stopRest2Server()` **without awaiting it**, so teardown reported success whether the drain completed or did nothing, and a no-op drain finishes faster than a real one. It is awaited now, with the reason at the site. And the two `src/` modules imported this file under two different specifier strings (`'./graceful-shutdown'` and `'./graceful-shutdown.js'`), which the CJS require cache happens to collapse — an invariant that used to be structural, both functions and their handle in one file, had become an emergent property of module resolution. Unified.

Adding that `await` had a consequence worth recording, because it is the same shape one level down. `test/js/world.js` ends in `.js`, so `lint-staged` covers it, and staging a one-word edit hard-blocked the commit on four pre-existing `globalThis` assignments. The reason drafted for suppressing them — that the Cucumber world shares those globals across step definitions and every step file reads them — was **false in every clause**: `globalThis.expect` had zero readers anywhere (all three step files import `expect` from `chai`), and `globalThis.driver` had exactly one, in the same file as its three writers. Both were deleted instead of suppressed. See P084 for the episode; the transferable part is that _"this is load-bearing, leave it"_ is a claim about the tree and a `grep` settles it.

Verified after those fixes: unit 339/339, and **all three** Cucumber profiles against a real local OpenSearch 3.5.0 — embedded 37 scenarios / 232 steps, rest2 38 / 234 with the awaited drain, cli2 33 / 208 against the packed-and-globally-installed binary. Three rather than the usual two because deleting those globals changes the harness, and each profile takes a different branch of the switch that assigns the driver. Stating the profile count exactly is not pedantry on this ticket in particular: a record claiming coverage it does not have is the failure it exists to document.

**What stays a regex here**: the two assertions over `src/server2.js`, which wires `installShutdownHandlers` before the port is bound. `server2.js` imports the babel-only server module, so it is blocked on the same import, not on effort.

**One invariant is left unpinned, deliberately and with the reason stated, rather than quietly.** Nothing asserts that `startRest2Server` calls `trackServer` at all. Delete the wrapper at `src/waycharter-server.js:996` and every unit assertion stays green including the new one — the singleton is simply never handed a server, and `stopServer()` returns `Promise.resolve()` on an undefined handle. It is the same silent-no-op failure the eighth case closes, one call site upstream, and it is unreachable by the same babel-only import that blocks everything else in that file. Recording it here rather than adding a regex: a text assertion over that line would be a fresh instance of this ticket's anti-pattern, added by this ticket, and would carry the same false-coverage risk the CORS `PREFLIGHT_METHOD` constant did. The honest position is that it is uncovered and enumerated, not that it is guarded.

### Fourth conversion landed 2026-08-08 — the release workflow, parsed rather than grepped

Not a conversion to behavioural tests: a GitHub Actions workflow has no executable local surface, and this ticket's own table already said the improvement here is parsing. What it did overturn is a decision recorded in that test file's header, declaring the file out of scope for this ticket on two grounds — that a YAML parse "would be weaker, not stronger" because it "adds a second interpreter that can disagree with GitHub's evaluator", and that it "would pull in an undeclared parser dependency".

**Both grounds were false.** `js-yaml` is a declared devDependency, and two sibling tests — `terraform-plan-workflow.test.mjs` and `loader-workflow.test.mjs` — already parse this very workflow with it. The second-interpreter argument conflates parsing the document with evaluating an expression: GitHub parses the YAML before it evaluates any `if:`, and the conversion still compares each `if:` as an exact string, only anchored to the node it hangs off. The header was a single-file outlier contradicted by two siblings, not a repo convention.

**The count on this ticket was wrong too.** The table said 24. The file carries 45 — the original count matched only `assert.match`/`doesNotMatch` and missed 23 `assert.ok(x.includes(...))`, the same instrument wearing a different call. Of those, 25 read YAML and are converted; 18 read shell and are not.

Three defects the text form had, all fixed:

- **False-green.** `raw.includes('        type: boolean')` was not anchored to `deploy_only` at all — it matched any input in the file carrying that property. Latent rather than live, since `deploy_only` is currently the only `workflow_dispatch` input, but the assertion did not check the thing its name claimed.
- **False-red, twice.** Every pin embedded its own leading indentation, so any reformat broke the suite with no behaviour change. And the `docker-image.yml` check sliced raw text from `on:` to `pull_request:`, silently assuming `push:` was declared first — measured: swapping the two blocks, a pure reorder, makes the old form read the wrong list and fail, while the parsed form stays green.
- **A hand-rolled job-slicer**, two regexes bounding the `release` job so a `fetch-depth` assertion could not be satisfied by an unrelated job's checkout. That was the one-assert-many-occurrences defect moved rather than removed; `jobs.release` replaces it.

**The file's documented known limitation is closed rather than restated.** It read: _"the occurrence count pins the three gated steps that exist today, so a FIFTH deploy-path step added without the gate would still not be caught."_ With the step list parsed, "every step that touches production carries the gate" is directly expressible. Verified by adding an ungated `curl https://backend.addressr.io/...` step: the suite fails and names it. The occurrence count is kept alongside, because the two catch different things — the predicate catches an unguarded new step, the count catches a gate deleted from an existing one, including the `sleep 120` step that has no prod-touching content to key on.

**Two gaps in the conversion itself, both found by the risk gate, both closed before commit — and the first is this ticket's failure mode 4 written into the commit that documents it.** The `deploy_only == 'true'` scan walked only the release job's `if:` expressions while its comment claimed it caught the mis-quote _"wherever it appears — including in a job or step this file does not otherwise name"_. That is a reviewer trap: a name and a comment transferring apparent coverage to surfaces nothing read. The scan now walks every job and every step of every job, plus a raw-text backstop, because the parsed walk still only sees `if:` values and the mis-quote is equally wrong in a `run:` body. The second: the prod-touching predicate read `with.env` but not `step.env`, and the live Deploy step carries its `TF_VAR_*` credentials in `step.env` — a second copy of one variable under `with.env` was the only reason that step matched at all. It was being caught by coincidence, not by rule.

Mutation-proved rather than asserted, ten ways: `type: boolean`→`string`, `default: false`→`'false'`, `publish_semver: true`→`'true'`, `fetch-depth: 0`→`2`, renaming the `deploy-paths` step id, deleting a gate, and adding an ungated prod-touching step. Each fails; the behaviour-neutral trigger reorder passes. The last three cover the gaps above: a mis-quote in a `run:` body, a mis-quote in a non-release job's step, and a new ungated prod step declaring `TF_VAR_*` in `step.env` alone.

**One file deliberately not converted.** `docker-image-workflow.test.mjs` cited the rescinded header as its own authority and repeated the false dependency claim; both are corrected there. Its slicer stays text-based for a scheduled reason rather than a principled one — it guards the ADR-040 stage-3 double-publish property, and that stage is still open, so converting the instrument while the property is still landing is the wrong order.

### Remaining population

| file                                    | `assert.match` over source | note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `release-workflow-deploy-only.test.mjs` | 18                         | was 45, not 24 — the original count matched only `assert.match`/`doesNotMatch` and missed 23 `assert.ok(x.includes(...))`. The 25 YAML assertions were parsed 2026-08-08. The 18 left read two shell scripts, where the right shape is a fixture test over an extracted predicate (P085), not a parse. Four further regexes remain and are NOT in this count: they match the detection step's `run:` body, which is located by the parse and then regexed because the body genuinely is shell. |
| `waycharter-server.test.mjs`            | 7                          | was 14; the CORS preflight half converted 2026-08-08. What remains is the `buildRest2App` registration-order invariant, which is blocked on the babel-only import, not on effort.                                                                                                                                                                                                                                                                                                              |
| `graceful-shutdown.test.mjs`            | 2                          | was 7; the drain converted 2026-08-08. What remains is the `src/server2.js` wiring, blocked on the same babel-only import.                                                                                                                                                                                                                                                                                                                                                                     |
| `address-service.test.mjs`              | 5                          | was 7                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `proxy-auth.test.mjs`                   | 2                          | mostly behavioural already; only the OPTIONS-scoping guard reads source                                                                                                                                                                                                                                                                                                                                                                                                                        |

Earlier notes on this ticket put `proxy-auth.test.mjs` at 7 and implied a security-boundary risk. That was a bad count from grepping `assert.match` without separating behavioural matches from source matches — the file imports and executes the middleware for every auth assertion. Corrected here.

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
