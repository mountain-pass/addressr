# Problem 033: Source-inspection tests are an anti-pattern in this codebase

**Status**: Known Error
**Reported**: 2026-04-28
**Priority**: 16 (High) — Impact: Significant (4) × Likelihood: Likely (4). **Re-rated 2026-08-08 on confirmed evidence, not on judgement.** Impact 4: this ticket's own failure mode 2 hid a production defect for four months, and that defect falsified two ADRs and the closure of a problem ticket — the harm is to the trustworthiness of the record, not just to a code path. Likelihood 4: no longer hypothetical. It has fired once, demonstrably, on the exact example this ticket names in its Description; a population of further source-inspection assertions remains — **34 across four files at the time of this re-rating**, which is the figure the rating was set against. The rating is not re-derived on every conversion. **There is no live count to point at**: every assertion tally on this ticket was withdrawn on 2026-08-19 after three attempts produced three figures by a method that over- and under-counts at once. The population is now identified by file rather than by tally; the rating stands on the demonstrated instance (a production defect hidden for four months), which no recount affects.
**Origin**: internal
**Effort**: XL — **re-rated M → XL 2026-08-20 at the Open → Known Error transition (P047).** M was set when the fix was believed to be "audit + progressive replacement cadence". The audit is now DONE and it sized the actual fix: converting the non-workflow population is 22 files, each needing a real behavioural test written, which is multi-day work. The note-what-it-cannot-establish task adds nine more files. Multi-day ⇒ XL per the effort table. **This LOWERS WSJF from 8.0 to 4.0 even though the Known Error multiplier doubles**, because effort quadruples — and that is the formula being honest rather than a demotion. The ticket sat at 8.0 on an estimate that predated knowing what the fix was.
**WSJF**: 4.0 — (16 × 2.0) / 8 — re-rated 2026-08-20 at the Known Error transition (status multiplier 1.0 → 2.0, effort M → XL). Was 8.0 — (16 × 1.0) / 2, re-rated 2026-08-08 on the P091 evidence; was 3.0 (6 × 1.0) / 2, backfilled 2026-07-29 (review)

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

That is precisely what occurred. See [P091](../open/091-sla-range-expanded-indexed-at-wrong-path-never-searchable.md).

`sla_range_expanded` has been indexed one level too deep — at `_source.structured.sla_range_expanded` rather than the top-level path the mapping declares and every query targeted — since **2026-04-20**, eight days before this ticket was filed. Measured against production 2026-08-08: the field is populated on **0 of 16,905,824** documents, while **349,540** range-form documents should carry it.

Three layers of tests were green throughout:

| instrument                          | what it asserted                                                                    | why it passed                                                                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `address-service.test.mjs`          | `/rval\.sla_range_expanded\s*=\s*expandRangeAliases\(/` **against the source text** | The assignment does exist. The source is correct; the _assembly site downstream of it_ is not.                                           |
| `elasticsearch.test.mjs`            | the mapping **declares** the field                                                  | It does. Declaration is not population.                                                                                                  |
| ADR-028 Cucumber endpoint scenarios | endpoint recall for `103` / `107 GAZE RD`                                           | Recall is carried by the whitecomma tokenizer split, so they pass identically with the field absent — which is what they had been doing. |

**No test at any level asserted that a range document is retrievable by its alias.** The one assertion that named the feature was the source-inspection regex, and it is structurally incapable of detecting the defect: the code it greps for is present and correct.

The cost was not a wrong number in a test report. It was four months during which [ADR-026](../../decisions/026-range-number-address-expansion.superseded.md) and [ADR-028](../../decisions/028-range-number-endpoint-only.proposed.md) recorded an index-side mechanism as working when it had never executed, [P015](../closed/015-range-number-addresses-not-searchable-by-base-number.md) was closed on it, and [P075](../open/075-adr041-inverts-exact-vs-range-on-one-address.md) attributed a live ranking inversion to an alias that is not in the index.

### The population that can still fire

Each of these is a claim of coverage that executes no code. **There is no live count anywhere on this ticket, by decision** — see the withdrawal below. The single-home rule this section used to state was the right instinct and it was not enough: it kept two tables from disagreeing, but nothing kept the one remaining table from being wrong, and it was, four times. Two tables of the same fact is how this ticket came to say 7 and 14 for the same file twenty lines apart; the unit of a correction is the claim, not the locality — and the unit of a _measurement_ is the method, which is why the method is now published and the numbers are not.

The count at re-rating time, 2026-08-08, was **34 across four files**, which is what the Likelihood-4 rating was set against. That figure is a historical anchor for the rating, not a current measurement. One of its rows was wrong when written: `proxy-auth.test.mjs` was counted at 7 by grepping `assert.match` without separating behavioural matches from source matches — the true figure is 2, and the retraction is recorded below. Of the other rows, one (`release-workflow-deploy-only`) has since been withdrawn rather than recounted and the rest still carry cardinals from the discredited method. So this figure is a dated anchor for the rating and nothing else. **Do not add it up.**

`proxy-auth.test.mjs` was named here as the one to look at first, on the grounds that ADR-024 proxy authentication is a security boundary. **The count that drove that priority was wrong — 2 source pins, not 7 — so it is not the place to start.** The security-boundary reasoning was sound; the count it was applied to was not.

**Its two surviving pins are NOT redundant, and must not be deleted in a conversion sweep.** They read `waycharter-server.js`, slice the region from `buildRest2App` to `app.use(proxyAuthMiddleware())`, and assert no `app.all/get/post/put/delete/patch` is registered in it — no data-method responder mounted ahead of auth, on **any** path. The behavioural cover in `waycharter-server.test.mjs` (unauthenticated `OPTIONS /addresses` → 204, `GET /addresses` → 401, and the CORS-off arm) pins that ordering for **one** path; a responder mounted pre-auth on any other path passes all of it. So these two are sole cover for the wider property.

And they are weak cover for it, on this ticket's own terms: a source-region scan cannot see a terminating `app.use` handler mounted ahead of the middleware — the same limitation recorded for the preflight regexes further down. That is a live gap over an auth boundary, not a discharged one.

**The first version of this withdrawal said the opposite** — that "the auth path is exercised and there is no green light over anything" — which was a coverage claim asserted without opening the file, in the ticket that exists to catch coverage claims asserted without opening the file. It is recorded rather than quietly fixed because the frequency is the evidence: this is the fourth correction to this section, and each one was introduced by the fix to the one before it.

### What "replace" has to mean

Deleting these tests is not the fix, and neither is rewriting them one-for-one. The replacement must assert the **observable outcome** — for P091 that means indexing a range document and searching for it by its alias, which fails against today's code and is the test that should have existed since April. A behavioural test that stops at "the function returned the right object" would also have missed this, because `mapAddressDetails` **did** return the right object; the loss happened at the assembly site downstream. The invariant worth pinning is end-to-end: _what goes into the index is what the query can find_.

## First conversion landed 2026-08-08 — the `sla_range_expanded` block

Three of the assertions this ticket names by example are now behavioural. `attachRangeAliases` and `buildIndexedDocument` are extracted to `src/build-indexed-document.js` as clean ESM and covered by 11 executing assertions in `test/js/__tests__/build-indexed-document.test.mjs`. The `assert.match` count in `address-service.test.mjs` drops 7 → 5.

The extraction follows the path this repo already uses to escape the babel-only constraint that forced source-inspection in the first place: `src/build-search-body.js`, `src/init-index-config.js`, `service/gnaf-package-fetch.js` and `utils/stream-down.js` were all moved out for the same reason.

**Two findings from doing it, both of which sharpen this ticket's thesis.**

**1. The assertion was watching the wrong site.** The regex greps `mapAddressDetails` for `rval.sla_range_expanded = expandRangeAliases(`. It matched for four months while the field reached 0 of 16.9M documents ([P091](../open/091-sla-range-expanded-indexed-at-wrong-path-never-searchable.md)), because the code it matches is **correct**. The defect is seventy lines away at the document-assembly site, which had no test of any kind. A test named after a feature was covering the half that worked, and its name is what made the other half look covered.

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

**What deliberately stayed a regex — SUPERSEDED 2026-08-09, and left here with its correction rather than rewritten, because the reasoning was sound for as long as its premise held.** The registration _order_ — `app.options` mounted ahead of `proxyAuthMiddleware`, so a preflight is answered before authentication — is a fact about `buildRest2App`'s statement order, not about the handler. `buildRest2App` cannot be imported by raw Node ESM: it transitively pulls `service/address-service` through a babel-only bare specifier. Source inspection is the honest instrument until that import is resolved, and the block now says so rather than implying the whole area is covered. **The premise expired.** ADR-044 made `buildRest2App` importable by raw Node ESM, and this cluster converted the same day: see the Remaining population row, which now reads 0. The ordering invariant is pinned behaviourally — an unauthenticated `OPTIONS` returns 204 while an unauthenticated `GET` on the same path returns 401 — which also closes a gap both regexes had, since neither could see a terminating `app.use` handler mounted ahead of the middleware.

Live behaviour is separately covered by `test/resources/features/cors-preflight.feature` (5 scenarios, real HTTP through the auth chain). Verified rather than assumed: `cucumber-js -p default --dry-run --tags 'not(@not-nodejs) and not(@geo) and @not-rest2'` selects exactly those 5, and `@not-rest2` is unique to that file — so the 37-scenario default-profile run cited for this change did exercise the rewired handler end-to-end. Worth noting for this ticket's history: that file's absence was once asserted in a comment here as though it existed, leaving the text-matching guard as the only cover for the ADR-037 runtime behaviour.

**One assertion was written and then removed, and it belongs in this ticket's record because it is this ticket's own thesis.** The first draft exported `PREFLIGHT_METHOD = 'OPTIONS'` from `src/cors-preflight.js` and asserted it under the name _"answers only OPTIONS — a wider method would be an auth bypass"_. But `waycharter-server.js` registers via the literal `app.options` and never consumed the constant, so the assertion compared a literal to itself: it would have stayed green through the exact widening its name claimed to prevent. That is a source-inspection failure in a costume this ticket had not yet catalogued — not a regex, but an executing assertion over a value nothing wires to the system. Executing is necessary, not sufficient; the assertion has to be on a path the production code takes. The removal is recorded in a comment at the site so the next person does not re-add it.

### Third conversion landed 2026-08-08 — the server drain, and a lint suppression it deleted

Five more retired. `stopServer` and `forceCloseConnections` moved from `src/waycharter-server.js` into `src/graceful-shutdown.js`, joining the handlers that already call them, and `graceful-shutdown.test.mjs` drops 7 → 2.

The retired assertions read the function _body as text_: that it contains `Promise.resolve()`, contains `server.close((`, contains `closeIdleConnections()`, and `doesNotMatch(/reject/)`. That last one is the sharpest illustration this ticket has produced of why text is the wrong instrument — it fails on a variable named `rejectedCount`, and it passes on a promise that rejects through a helper. It was checking a spelling, on the path that decides whether an in-flight request is answered or dropped during a deploy.

Seven executing assertions replace them, including two properties the regexes could not express:

- **`close()` is requested BEFORE idle sockets are closed.** Reversed, a new connection can land in the gap. A regex sees both statements and not their order.
- **`stopServer` resolves — not rejects — when `close()` hands back an error.** The behavioural form of `doesNotMatch(/reject/)`. It runs the drain with a failing callback and asserts the promise settles fulfilled, which is the actual contract: `test/js/world.js` discards the return value, so a rejection there fails teardown.

**Extraction shape, and why it is a factory.** `createServerLifecycle()` closes over the handle and returns the three functions; a process-wide singleton is destructured from one call. Two things fall out. A test gets a genuinely independent handle by calling the factory again rather than defeating the module cache with a query-string import — the first draft did exactly that, and it is a smell. And **the singleton is a `const` initialised once, so `unicorn/no-top-level-assignment-in-function` stops firing**: the suppression granted against that rule on the `trackServer` wrapper in `packages/addressr/src/waycharter-server.js` hours earlier is gone from the tree, removed rather than relocated. It was deferred on the grounds that the shutdown lifecycle had no unit cover to catch a mistake; landing the cover dissolved it. Recorded on P084 as the argument for sequencing that ticket behind this one.

**The extraction opened a coverage gap of exactly this ticket's own kind, and the risk gate caught it.** All seven new assertions build a fresh lifecycle via the factory — which is what makes them independent, and is also why, on their own, they prove nothing about the instance production runs. `server2.js` hands `installShutdownHandlers` the _singleton's_ functions and `startRest2Server` calls the _singleton's_ `trackServer`; if those ever stopped referring to one closure, all seven would still pass. Nothing executed the wiring.

The failure mode is what makes it worth an eighth case rather than a note. `stopServer()` on an untracked handle returns `Promise.resolve()` — a broken wiring does not throw and does not hang. It drains nothing, instantly, and exits 0. So the eighth case executes the exported singleton itself, and it is mutation-proved: splitting the export into two `createServerLifecycle()` calls fails that case and only that case.

**Two claims about test evidence were also wrong, and both are corrected here.** I cited the rest2 tier as proof the drain works because it binds a real listener. It could not have been: `test/js/world.js`'s `AfterAll` called `stopRest2Server()` **without awaiting it**, so teardown reported success whether the drain completed or did nothing, and a no-op drain finishes faster than a real one. It is awaited now, with the reason at the site. And the two `src/` modules imported this file under two different specifier strings (`'./graceful-shutdown'` and `'./graceful-shutdown.js'`), which the CJS require cache happens to collapse — an invariant that used to be structural, both functions and their handle in one file, had become an emergent property of module resolution. Unified.

Adding that `await` had a consequence worth recording, because it is the same shape one level down. `test/js/world.js` ends in `.js`, so `lint-staged` covers it, and staging a one-word edit hard-blocked the commit on four pre-existing `globalThis` assignments. The reason drafted for suppressing them — that the Cucumber world shares those globals across step definitions and every step file reads them — was **false in every clause**: `globalThis.expect` had zero readers anywhere (all three step files import `expect` from `chai`), and `globalThis.driver` had exactly one, in the same file as its three writers. Both were deleted instead of suppressed. See P084 for the episode; the transferable part is that _"this is load-bearing, leave it"_ is a claim about the tree and a `grep` settles it.

Verified after those fixes: unit 339/339, and **all three** Cucumber profiles against a real local OpenSearch 3.5.0 — embedded 37 scenarios / 232 steps, rest2 38 / 234 with the awaited drain, cli2 33 / 208 against the packed-and-globally-installed binary. Three rather than the usual two because deleting those globals changes the harness, and each profile takes a different branch of the switch that assigns the driver. Stating the profile count exactly is not pedantry on this ticket in particular: a record claiming coverage it does not have is the failure it exists to document.

**What stays a regex here**: the two assertions over `src/server2.js`, which wires `installShutdownHandlers` before the port is bound. **Blocker restated 2026-08-09** — it was recorded as the babel-only import, and ADR-044 retired that. What actually blocks them is that `server2.js` is a top-level side-effecting entry: importing it starts a server and connects a search client, so the honest conversion is a child-process one (spawn, assert exit, assert no port binds), which is a different shape and cost from the in-process conversions and is not blocked on anything but effort. **Under the rule settled 2026-08-20 these are illegitimate, not exempt** — they are pending conversion, not a permitted shape. What keeps them unconverted is the port-binding blocker recorded below, not a wiring exemption.

**One invariant is left unpinned, deliberately and with the reason stated, rather than quietly.** Nothing asserts that `startRest2Server` calls `trackServer` at all. Delete the `trackServer` wrapper in `packages/addressr/src/waycharter-server.js` and every unit assertion stays green including the new one — the singleton is simply never handed a server, and `stopServer()` returns `Promise.resolve()` on an undefined handle. It is the same silent-no-op failure the eighth case closes, one call site upstream. **Blocker restated 2026-08-09**: `src/waycharter-server.js` imports fine under raw Node ESM now, and the seven assertions that were blocked on that are converted. What keeps this one uncovered is narrower and is not an import problem — reaching the `trackServer` call means letting `startRest2Server` get past its validators and BIND A PORT, and the converted tests deliberately exercise only the paths where it rejects first. Recording it here rather than adding a regex: a text assertion over that line would be a fresh instance of this ticket's anti-pattern, added by this ticket, and would carry the same false-coverage risk the CORS `PREFLIGHT_METHOD` constant did. The honest position is that it is uncovered and enumerated, not that it is guarded.

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

Mutation-proved rather than asserted, ten ways: `type: boolean`→`string`, `default: false`→`'false'`, `publish_semver: true`→`'true'`, `fetch-depth: 0`→`2`, renaming the `deploy-paths` step id _(that mutation retired 2026-08-10 with the axis; the assertion it proved is gone and a new one — that the axis cannot silently return — replaces it, mutation-proved by re-adding the step)_, deleting a gate, and adding an ungated prod-touching step. Each fails; the behaviour-neutral trigger reorder passes. The last three cover the gaps above: a mis-quote in a `run:` body, a mis-quote in a non-release job's step, and a new ungated prod step declaring `TF_VAR_*` in `step.env` alone.

**One file deliberately not converted.** `docker-image-workflow.test.mjs` cited the rescinded header as its own authority and repeated the false dependency claim; both are corrected there. Its slicer stays text-based for a scheduled reason rather than a principled one — it guards the ADR-040 stage-3 double-publish property, and that stage is still open, so converting the instrument while the property is still landing is the wrong order.

### Remaining population

| file                                    | `assert.match` over source | note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `release-workflow-deploy-only.test.mjs` | WITHDRAWN (see below)      | was 45, not 24 — the original count matched only `assert.match`/`doesNotMatch` and missed 23 `assert.ok(x.includes(...))`. The 25 YAML assertions were parsed 2026-08-08. The 18 left read two shell scripts, where the right shape is a fixture test over an extracted predicate (P085), not a parse. **For the two watcher scripts that extraction has now happened** — `scripts/scan-jobs.awk` exists, `scan-jobs-awk.test.mjs` covers it in 15 fixture cases, and the pins over those scripts were repointed to assert the wiring rather than the decision, which the settled rule counts as illegitimate too — better than asserting a private copy's contents, but still a text assertion. The remainder of this row is still unconverted. Four further regexes remain and are NOT in this count: they match the detection step's `run:` body, which is located by the parse and then regexed because the body genuinely is shell. |
| `waycharter-server.test.mjs`            | 0                          | was 14, then 7. **Cleared 2026-08-09**: ADR-044 removed the babel-only import, and all seven became executing assertions driving `buildRest2App` through `light-my-request`. Mutation-proved against four reversions — moving `app.options` after `proxyAuthMiddleware`, dropping the CORS gate, deleting the `validateReadShadowConfig()` call, and removing the debug endpoint from the proxy-auth allowlist. Each fails exactly one case.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `graceful-shutdown.test.mjs`            | 2                          | was 7; the drain converted 2026-08-08. **The stated blocker was retired 2026-08-09 and replaced, not cleared**: these two read `src/server2.js`, a top-level side-effecting entry — importing it starts a server and connects a search client — so the honest conversion is a child-process one (spawn, assert exit, assert no port binds), a different shape and cost from the in-process conversions. Blocked on entry-point side effects, NOT on the babel-only import.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `address-service.test.mjs`              | 5                          | was 7. **No structural blocker as of 2026-08-09** — ADR-044 made the module importable and every remaining assertion covers a path reaching OpenSearch only via the stubbable `globalThis.esClient` global. Unlike `graceful-shutdown.test.mjs`, nothing replaced the retired blocker; what remains is effort. **Owner, so "effort" is not an open-ended exemption**: the P012 progress-logging block is owned by JTBD-203 (self-hosted operator, G-NAF refresh) — its subject is the loader emitting ~60K JSON lines per state reindex and drowning out real errors, which is that persona's documented fail-loud pain, and JTBD-203 binds itself to this ticket's disposition. Read-shadow → JTBD-201, `getAddress` catch → JTBD-003/JTBD-100.                                                                                                                                                                                         |
| `proxy-auth.test.mjs`                   | 2                          | mostly behavioural already; only the OPTIONS-scoping guard reads source                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

**Repo-wide recount, 2026-08-19 — this PARTIALLY discharges Investigation Task 1, and it reports NO
assertion total, on purpose.** Three attempts at one produced three different figures, and the third failed
while this very amendment was being written. The attempts are recorded because the pattern is the finding:

1. "152 across 18 files" above a table reading 112 + 99 across 9 + 21. Those do not sum. The headline and
   the table came from two scripts measuring two different populations; the table's had no "reads a repo
   file" filter at all. Its dependent claim, "roughly three-quarters is workflow pinning", had no valid
   denominator.
2. A two-sided bound, 189 to 560, with both rows required to sum. The arithmetic held. The rule did not:
   the lower bound scored `mutate-helper.test.mjs` at 16 (its assertions are over a subprocess's stdout)
   and `proxy-auth.test.mjs` at 8, of which 2 are source pins and 6 match an error message. It counts
   things that are not pins and misses pin shapes nobody has enumerated — in **both** directions at once,
   so it is not a bound.
3. The same rule re-run minutes later returned 199, not 189, because tests had been added to this commit
   in between. A figure that moves under the author's own edits is not a measurement of the codebase.

**So the count is withdrawn rather than corrected again.** A pattern-keyed scan cannot separate "asserts on
text it read from a file" from "asserts on text a source pin cares about", and every attempt to make it do
so has produced a number that read as precise and was not. What settles this is Investigation Task 1's
per-file read, which is why that task stays open.

**What IS established, because it rests on file identity rather than on tallies:**

| fact                                                          | count |
| ------------------------------------------------------------- | ----- |
| test files that read a repo file and assert on what they read | 33    |
| of those, files that read `.github/workflows/**`              | 9     |
| all other file-reading test files                             | 24    |

**The predicate is published so the classification can be rerun, not just the result.** A file is in the
population if its source matches `readFileSync|readFile\(|readdirSync` and contains `assert.`; it is in the
workflow group if it contains both `.github` and `workflows`; and
`p033-population-figures-recompute.test.mjs` is **excluded**.

That last clause is not a convenience. That file is the guard which recomputes these figures, and it
satisfies every clause of the predicate — it reads test files, it asserts, and it quotes the literal
`.github/workflows` while explaining the rule — so run without the exclusion the rule returns 34 / 10 / 24
and counts the instrument into the sample it measures. It is stated here because the whole claim of this
paragraph is that a third party can rerun the rule and get the table; a rule published in one form and run
in another would make the guard green while the record stayed falsifiable, which is the failure this ticket
is about.

The nine are `deploy-guard-surfaces`, `docker-image-workflow`, `gnaf-source-smoke`,
`license-audit-runs-in-ci`, `loader-workflow`, `release-pr-plan-workflow`,
`release-workflow-deploy-only`, `terraform-plan-workflow` and `workflow-npm-scripts-resolve`.

**The first version of this list, as at 2026-08-08, said nine and omitted `license-audit-runs-in-ci`** (the correct answer was ten at that date; the list says nine again today for an unrelated reason — the perf-probe deletion of 2026-08-20 — so this sentence indicts the 2026-08-08 list, not the current one), because the predicate
then matched the literal string `.github/workflows` and that file builds the path with
`path.join(repoRoot, '.github', 'workflows')`. Publishing the predicate is the fix for that class: a named
list with a stated rule is checkable by rerunning the rule, where a bare count is checkable by nobody. It is
also the fourth miss by a pattern-keyed scan on this ticket, which is the argument for Investigation Task 1
being a per-file read rather than a better regex.

**The guard fired on 2026-08-19, the first time the population moved.** Adding
`perf-validity-covers-declared-legs.test.mjs` for P104 took the total from 31 to 32, and
`p033-population-figures-recompute.test.mjs` reddened the suite until this table was updated. That is the
whole point of computing these figures rather than asserting them: five rounds of hand-correction never
once caught a drift at the moment it happened, because nothing was watching.

Even now this over-counts the other group: `mutate-helper.test.mjs` is among the 24 and holds no source pin
at all. File identity is robust enough to route the work, and that is all it is used for.

**This headline now has a mechanical inflator attached, and it inflates in the WRONG DIRECTION.** The figure
counts "test files that read a repo file and assert on what they read". Every governance guard added to this
repo satisfies that predicate — and Step 2 explicitly excludes exactly those files from the anti-pattern, because
for them the artefact IS the subject. So each new guard raises the headline while lowering the share of it that
is the actual problem. It moved twice on 2026-08-20 alone, 31 → 32 → 33, both times because a guard was added,
neither time because a source-inspection pin was written.

The number stays arithmetically true and becomes a worse proxy for the size of the problem every time. **Route
work by file identity, never by this cardinal.** The Step 1 / Step 2 split below is the figure that means what a
reader expects the headline to mean.

**The conclusion that survives, and the one that does not.** Those nine files pin YAML consumed by GitHub.
Nothing in this repo runs a workflow, so extract-and-feed cannot convert those PINS and the honest
remedy is the note-what-it-cannot-establish task below. Said of the pins, not of the files — three of the
nine spawn a runtime for something else, so the older wording "there is no runtime in this repo to feed
them" was true of six files and is corrected below. **Restated 2026-08-20 (second pass):** this paragraph
still read "three of the ten … true of seven" after the perf-probe deletion moved the workflow group 10 → 9,
because the restatement pass that ran below reached the correction note and not this sentence. Two tables of
one fact, corrected in the ticket that exists to name that defect — the fifth such correction here. That is a claim about what those files ARE, and it
holds without any assertion count. What does **not** survive is any statement about the proportion —
"roughly three-quarters", "45 to 70 per cent", and every figure in the three attempts above are withdrawn.

**Superseded first draft of the retraction, kept as history — do NOT read it as the current position.** It
read: _"Earlier notes on this ticket put `proxy-auth.test.mjs` at 7 and implied a security-boundary risk.
That was a bad count from grepping `assert.match` without separating behavioural matches from source
matches — the file imports and executes the middleware for every auth assertion."_ The count correction is
right and stands. The clause after the dash is **wrong**: the two surviving pins read `waycharter-server.js`
as text and execute nothing. The current position is stated in full under "What replace has to mean" above,
including why those two pins are live sole cover and must not be swept.

## 2026-08-19 — the shape that replaces the pin, and the tooling that proves it

**The remedy is now demonstrated, not proposed.** `scripts/push-and-watch.sh` and `scripts/release-watch.sh`
carried a byte-identical inlined `awk` job scan, pinned by source assertions. P085 records five defects in
that scan and then five more holes in its own fix — every one a hole about an exit code, every one pinned
only by an assertion that some text was written. Its conclusion is this ticket's thesis in another voice:

> each new `assert.match` closes one instance and is itself a new instance waiting to rot.

The scan is now `scripts/scan-jobs.awk`, with its verdict in the exit code — 0 all green, 1 a job did not
succeed, 2 nothing scanned (UNKNOWN, not success). `test/js/__tests__/scan-jobs-awk.test.mjs` feeds it
fixtures and asserts those codes across 15 cases, including every conclusion that reached the SUCCESS path
under the predecessor. Four historical defect shapes were reverted in turn and each was caught. The class
became impossible rather than watched-for.

The source pins over those scripts were **repointed rather than deleted**: they now assert the scripts LOAD
the shared scan and have not grown a private copy. **RULE SETTLED 2026-08-20 by the maintainer, and it is the strict reading.** A text assertion over source
is illegitimate whether it pins a decision or a wiring connection. There is no wiring exemption. The two
sites that disagreed are reconciled to this: repointing a pin to assert a script still loads the shared
scan is better than asserting a private copy's contents, but it is still a text assertion and still counts.
The `startRest2Server` -> `trackServer` note below was right and is now the general rule — a text assertion
over a call site is a fresh instance of this anti-pattern, because the line can be present and never
reached. The Description's own `expandRangeAliases` import example stands as an instance, as first written.
**Scope of the settlement, stated because "there is no exemption" would otherwise read wider than it is:**
this retires the WIRING exemption only. The declarative-artefact carve-out in Step 2 is untouched — a
lockfile, a decisions index or a WSJF table is not source, so reading it is not a proxy for behaviour and
the declarative-artefact files counted in Step 2 are not in the population. What was retired is the claim that a text assertion over SOURCE
becomes acceptable when the thing it pins is a connection.

**Where the settlement did not reach on its first pass, recorded because it is a class and not a slip.** The
rule was settled here, in `docs/problems/`, and every instrument used to sweep for restatements was scoped to
that tree. Five sites asserting the retired position in the present tense sat one tree over, in
`test/js/__tests__/`, and were reached by nothing: the two halves of the repointing split
(`release-workflow-deploy-only.test.mjs` and `scan-jobs-awk.test.mjs`), a header calling its own pins "STILL
TEXT, deliberately", a sibling that QUOTED that retired wording to justify its own existence, and this
ticket's own guard naming `wiring` as a live verdict. A phrase list would have matched all five — the
instrument was correct and pointed at the wrong tree. All five are re-voiced as of 2026-08-20, per
`DECISION-MANAGEMENT.md`'s rule that a superseded claim is **deleted** in a code comment and **retained** in a
decision record. The re-voicing states standing as well as classification: illegitimate names the SHAPE, and
a red at one of those pins is still a real signal to convert rather than delete.

- [x] **DECIDED 2026-08-20 by the maintainer: no mechanical propagation check. The rule stands on adherence,
      and the trigger for revisiting is recurrence that goes undetected, not the one-off cleanup.** Stated in
      their words: _"Yes we missed some when we originally made the decision, but I expect new code to adhere
      to the decision moving forward. It's only if we keep introducing the wrong thing and it's not detected
      till much later, that we need to think about how we stop that from happening."_

      **This is a decision, not a deferral, and the difference matters to how it should be read.** The five
                                      sites were legacy — they predate the settlement and were written under the rule it retired. Building an
                                      instrument to catch a population that has already been cleaned is spending on the last defect rather
                                      than the next one. What would justify the instrument is a NEW pin written under the settled rule and
                                      reaching master unnoticed, and none has been observed. The residual is accepted knowingly: the sites
                                      were found by adversarial review rather than by any tool, so the current control is a human reading
                                      carefully, and that is what a recurrence would falsify.

                                      **Reassessment trigger, so this does not get re-litigated on the next sighting.** One stale site found
                                      and fixed promptly is not the trigger and does not reopen this. The trigger is the pair: the retired
                                      shape is REINTRODUCED after 2026-08-20, **and** it survives long enough that the finding is archaeology
                                      rather than review. That is the maintainer's condition, written as something falsifiable.

                                      **ADR-048's first reassessment criterion fired and is answered by this entry.** It names this exact
                                      class ("prose that is stale in meaning while resolving fine") and prescribes widening the guard rather
                                      than the claim. The disposition is: not now, on the reasoning above. The route it points at — a new
                                      composing ADR rather than an amendment to ADR-048, whose ratified Confirmation names this class as NOT
                                      COVERED — remains the correct route **if** the trigger fires. It is recorded here so that a future
                                      reader reaches the ADR question already answered rather than rediscovering it.

                                      **Spec retained for that event, because the cost of losing it is another audit.** Assert a non-zero floor on BOTH the scan set and the phrase list, or an empty listing
                                      passes green; ban the retired position asserted in the PRESENT TENSE rather than the token, because
                                      `docs/problems/` retains superseded prose by design and this ticket's own guard requires the Step 4
                                      tally sentence — which names `wiring` as a bucket — to survive verbatim; exclude the file holding the
                                      phrase list; and say in
                                      the test name that it establishes vocabulary only, never that the pins were converted.
                                      **Match CASE-INSENSITIVELY, and treat that as load-bearing rather than a nicety.** A reviewer checking
                                      the candidate phrase list against the five sites read it case-sensitively and reported that
                                      `scan-jobs-awk.test.mjs` matched nothing — it matches on `it pins the decision`, but only because the
                                      site writes `It pins the DECISION`. Measured against the pre-fix tree rather than reasoned about: a
                                      lower-case list matched case-sensitively reaches **one of the five sites**, and case-insensitively
                                      reaches all five. Four of the five shout the retired position in capitals, so a case-sensitive guard
                                      would have reported clean over four live instances. The review was wrong on the fact and right about
                                      the spec, which is why the correction is recorded here rather than merely answered.

**`scripts/mutate.sh` makes the practice cheap**, which is the point: the barrier was never disagreement,
it was six lines of `cp`/`sed`/run/restore per check.

    scripts/mutate.sh <file> <sed-expression> <test command...>
      0  CAUGHT  the test failed under the mutation — the guard works
      1  BLIND   the test passed — the guard does not watch that property
      2  NO-OP   the expression changed nothing — nothing was tested

**NO-OP is a distinct exit code because the absence of one caused a false result twice in one session.** A
hand-rolled loop reported all three of its mutations "caught" while the `sed` had matched nothing, so it was
testing an unmutated file. A mutation that does not apply is not a passing test, it is no test, and it has to
be louder than a blind guard rather than quieter. The helper is itself tested — trusting it because it
printed CAUGHT would be this ticket's own failure mode applied to the instrument.

### Evidence from the same session

Six verification checks reported green while unable to fail. Four are one-off session checks rather than
committed pins, and are recorded here as evidence for the practice rather than as items in the population:

- an `m` flag made `$` mean end-of-LINE in a lookahead, so a compendium check read headings and nothing else;
- `` inside a JS template literal is the BACKSPACE character, so the repair for that matched nothing and
  skipped silently — the same fail-open one edit later;
- a zip64 fixture was "verified" by scanning for `0xFFFFFFFF` byte patterns, where one eight-byte run yields
  five overlapping matches; the archive was ordinary and the test made an uncovered path look covered;
- a coverage claim came from a grep for `rel` that matched the letters inside other words.

Two are already owned elsewhere and are cited, not re-derived: the assertion that matched
`wait_for_completion || exit 1` while it was **commented out** is recorded on **P085**, and `find -size +0`
reporting every file non-empty (it means blocks, not bytes) is recorded on **P107**.

**Scope note.** This ticket owns source-inspection tests in `test/js/__tests__/`. It does not own ad-hoc
verification checks generally — that wider family is P107's. The four session instances above are evidence
that the practice pays, not a widening of this ticket's anchor.

## MECHANICALLY DEMONSTRATED 2026-08-20 — the pin is BLIND, and so is its whole file

The Known Error transition rested on P091, a documented production instance. That is strong causal evidence
but it is a historical narrative. This is the re-runnable version, and it postdates the change:

```
scripts/mutate.sh packages/addressr/service/address-service.js \
  "s|  mirrorRequest({ method: 'search', params: searchParameters });|  if (false) mirrorRequest(...);|" \
  npx --no-install node --test test/js/__tests__/address-service.test.mjs
→ BLIND  the guard PASSED under this mutation — it does not watch this property
```

**What the mutation does**: makes ADR-031's read-shadow mirror unreachable. The call is dead code; no shadow
request is ever issued. The import statement is untouched, so
`/import\s+\{\s*mirrorRequest\s*\}\s+from .../` still matches and the pin stays green — the line is
present and never reached, which is this ticket's thesis stated as an executable result rather than a claim.

**The stronger half, which was not the target.** The verdict is BLIND for the ENTIRE
`address-service.test.mjs` file, not just the import pin. Running the whole file under the same mutation also
passes. So the read-shadow mirror — the mechanism ADR-031 exists to provide, the one that de-risks a search
backend cutover — can be disabled outright and nothing in its dedicated test file notices.

The file was restored byte-clean afterwards (`git diff --stat` empty).

**Why this belongs in the record rather than in a session log**: it converts the Known Error reproduction
criterion from "a documented instance from four months ago" to "a demonstration anyone can re-run in under a
minute". It also gives the conversion work in Task 1 its first concrete acceptance test — a converted pin is
one where this same mutation reports CAUGHT.

## Symptoms

- Tests pass when the implementation is structurally similar but behaviourally broken.
- Tests fail when the implementation is refactored to a different shape with identical behaviour.
- Coverage tools (`nyc` per `package.json`) cannot tell that the assertions don't execute the code under test.
- A maintainer copying the existing pattern for a new test ships another source-inspection test, compounding the problem.

## Workaround

For the immediate User-Agent fix in this same session: write a **behavioural test** — import `fetchPackageData`, mock `fetch`, call the function, assert the captured request had the User-Agent header. The fix's test does NOT follow the existing source-inspection pattern; it sets a precedent for what behavioural tests look like in this codebase.

For the existing tests: they continue to provide some value (they catch coarse-grained regressions like "the function is gone entirely") but should be progressively replaced with behavioural tests as the relevant code is touched.

## Impact Assessment

- **Who is affected**: Addressr Contributor/Maintainer (JTBD-400 — Ship releases reliably from trunk) — false-green tests undermine the trunk-based release determinism. Indirectly, `web-app-developer` via JTBD-001 (Search and Autocomplete Addresses) — its outcome "Correct address appears in the first page of results for reasonable queries" is what P091 degraded — and `data-quality-analyst` via JTBD-003 (Geocode Addresses to Coordinates). **Repointed 2026-08-20**: this line read `(J1/J3/J4)`, which are pre-migration IDs from the retired `docs/JOBS_TO_BE_DONE.md` and resolve to nothing in `docs/jtbd/`, so the consumer-side hop this ticket claims was unanchored in the corpus. The hop is real but narrower than the wording implied: P091's own Impact Assessment records it as ranking degradation, not lost results.
- **Frequency**: continuous risk surface — every commit touching the implementations covered by source-inspection tests is exposed to false-green/false-red. The most-impacted files are `service/address-service.js` and `client/elasticsearch.js` (also has source-inspection tests).
- **Severity**: Moderate — production correctness depends on real behavioural coverage. The existing CI Cucumber suite catches integration-level regressions, so the source-inspection tests aren't the only line of defence; but they create maintainer friction and cognitive overhead.
- **Analytics**: N/A.

## Root Cause Analysis

### Why we have source-inspection tests

The pattern was likely introduced as a quick way to assert "this regex appears in the source" without spinning up a test runner that exercises addressr-server + OpenSearch. It's faster to write than a behavioural test, runs in milliseconds, and looks like it's testing the contract.

The file path `test/js/__tests__/address-service.test.mjs` is consistent with a JS test convention (`__tests__` directory, `.test.mjs` naming) which carries Jest-style behavioural-test connotations. Reviewers/contributors copying the pattern reasonably assume the existing tests are behavioural and follow suit.

### Investigation Tasks

- [x] **Audit all `test/js/__tests__/*.test.mjs` files. DONE 2026-08-19: thirteen source pins read
      individually, of which nine are illegitimate — everything that is not an anti-vacuity sentinel — not the hundreds
      every earlier count implied.** The per-file read this task called for was done. The method and every
      intermediate count are below, because three earlier attempts at a number were wrong and a fourth
      unexplained figure would deserve no more trust than they got.

      **Step 1 — 33 files read a repo file and assert on what they read.** Of those, **15 exercise the
                                                  subject** (they import it, statically or dynamically, or spawn it) and **18 read only**. The first
                                                  classifier missed `proxy-auth.test.mjs` entirely because it matched `from '...'` and that file uses
                                                  `await import(...)`. Corrected before use.

                                                  **Step 2 — of the 18 read-only files, NONE is a source-inspection test of implementation.** Six
                                                  read `.github/workflows/**`, where there is no runtime to exercise. The other twelve check declarative
                                                  artefacts — a lockfile agreeing with its manifests, doc links resolving, the decisions index, the
                                                  WSJF arithmetic. **For those the artefact IS the subject**, so reading it is not a proxy for
                                                  behaviour and not this anti-pattern. That distinction is the one every earlier count missed: `reads
                                                  a file` and `pins source text as a stand-in for what the code does` are different populations, and
                                                  conflating them is why the figures ran to the hundreds.

                                                  **Step 3 — the real population hides INSIDE behavioural files.** Assertions that read implementation
                                                  source and assert on its text, in files that also exercise the subject. Counted three ways and
                                                  enumerated by reading in Step 4, because the counts disagreed. A file-level audit cannot see these, which is why this task asked for a per-assertion read.

                                                  **Step 4 — the per-pin enumeration, and a fourth failed mechanical count.** Review found the table
                                                  below summed to 12 across five files while the prose above it said 13 across six, and named two live
                                                  pins the table omitted. Both omissions were real. Fixing the arithmetic was not enough: re-running the
                                                  count with a predicate broadened to catch offset-derived assertions returned 29 across seven files —
                                                  and spot-reading two of those seven showed it was counting subprocess stdout (`out`, `stdout`) as
                                                  source text.

                                                  **Three mechanical classifiers, three different wrong answers.** The first matched `from '...'` and
                                                  missed dynamic `await import(...)`. The second flagged `package.json`, because script PATHS inside it
                                                  look like source paths. The third counted subprocess output as file contents. Each was caught by
                                                  checking it against a single file. **This is the ticket's own thesis arriving inside the audit that
                                                  discharges it**: a pattern over source text is unreliable in both directions, which is why the remedy
                                                  for the population is behavioural exercise and the remedy for the audit is reading.

                                                  **So what follows is what was READ, pin by pin. Three files verified in full:**

                                                  | file | pin | verdict |
                                                  | --- | --- | --- |
                                                  | `graceful-shutdown` | `server2.js` imports `installShutdownHandlers` | DECISION, wiring |
                                                  | `graceful-shutdown` | it is called with `stop:` and `force:` | DECISION, wiring |
                                                  | `graceful-shutdown` | `installIndex` / `startIndex` sentinels, x2 | sentinel |
                                                  | `graceful-shutdown` | `installIndex < startIndex` — handlers installed before the port binds | DECISION, ordering |
                                                  | `proxy-auth` | `buildRest2App` and `app.use(proxyAuthMiddleware())` sentinels, x2 | sentinel |
                                                  | `proxy-auth` | `app.options(` present in the pre-auth region | DECISION |
                                                  | `proxy-auth` | no data-method registration in that region | DECISION, and the sharp one |
                                                  | `address-service` | imports `mirrorRequest` from `../src/read-shadow` | DECISION, wiring |
                                                  | `address-service` | `mirrorRequest({ method: 'search'` | DECISION, pins an argument value |
                                                  | `address-service` | the two `error_.body` guard-clause shapes, x2 | DECISION, asserts the catch block LOOKS right |

                                                  **Thirteen pins across three files: 0 wiring, 4 sentinels, 9 decisions.** The sentinel row is a
                                                  category the earlier count did not have, and it matters — but not all of them are load-bearing,
                                                  which is visible only by tracing each one's vacuity direction. Each is labelled below rather than
                                                  counted here, so adding a sentinel does not leave a stale total behind:

                                                  - `proxy-auth` `start !== -1`: without it, a missing `buildRest2App` makes `slice(-1, N)` return `''`
                                                    and the sharp `doesNotMatch` passes over an EMPTY region. **Floor.**
                                                  - `proxy-auth` `proxyAuth !== -1`: without it, a missing `app.use(proxyAuthMiddleware())` widens the
                                                    slice to the whole file, so the pin reports "registered before proxyAuthMiddleware" when there is no
                                                    proxyAuthMiddleware. **Floor**, and over an auth boundary.
                                                  - `graceful-shutdown` `installIndex !== -1`: without it, deleting the install call gives `-1 < start`,
                                                    which is TRUE, and the ordering pin passes vacuously. **Floor.**
                                                  - `graceful-shutdown` `startIndex !== -1`: `installIndex < -1` is already false, so the ordering
                                                    comparison fails closed without it. **Diagnostic** — it improves the message, it closes no vacuity.

                                                  Floors, then, except the last, which closes no vacuity. That is the same floor this repo has spent the
                                                  session installing everywhere else, and it asserts nothing about the subject at all — which is
                                                  why it is a sentinel and not a pin.

                                                  **Not read, and therefore not counted:** `deploy-artefact-ignores` (asserts over `deploy.sh` text).
                                                  A candidate by inspection; it has not had the per-pin read the three above got. Stated as pending
                                                  rather than folded into the total as an estimate. This entry named a second file,
                                                  `perf-validity-covers-declared-legs`, until 2026-08-20 — it asserted over `test/k6/regression.js`
                                                  text and both files were deleted with the perf probe, so the candidate resolved by removal rather
                                                  than by reading.

                                                  **RULE SETTLED 2026-08-20 by the maintainer — the strict reading.** This ticket had stated the
                                                  governing rule two incompatible ways: one place exempted pins over wiring, and the
                                                  `startRest2Server` -> `trackServer` note said a text assertion over wiring is itself a fresh
                                                  instance of this anti-pattern. **There is no wiring exemption.** A text assertion over source
                                                  counts whether it pins a decision or a connection, because the line can be present and never
                                                  reached — which is exactly what the `trackServer` note observed and declined to add a regex for.
                                                  Consequences applied: the three rows previously classed as wiring are now decisions, so the
                                                  illegitimate population grows by three, to the figure the audit headline above states and the
                                                  guard recomputes — restated here it would be a second uncomputed site, which is the drift this
                                                  ticket keeps producing; the Description's `expandRangeAliases` import example stands as an
                                                  instance, as first written; and the sites recording the two `server2.js` pins as pending
                                                  conversion are correct rather than stale — under this rule they always were.

                                                  **What this audit does NOT establish.** Three limits, the third of which was written because the
                                                  fourth mechanical count failed while the first two were being written:

                                                  1. An assertion over a differently-derived VALUE is missed, not merely a differently-derived string.
                                                     The live instance is the `indexOf`-offset ordering pin above — an integer — which the first count
                                                     did miss.
                                                  2. The sentinel / decision split, and what each pin covers, are judged by reading, not computed.
                                                  3. **Which cardinals here are computed, and which are read.** Computed and mutation-proved by
                                                     `p033-population-figures-recompute.test.mjs`: the 33 / 15 / 18 Step 1 split, the named nine-file list, the
                                                     un-excluded triple (34 / 10 / 24), the three intersections (six, twelve, three), and the Step 4 table's own

                                                     **Corrected 2026-08-20, and the correction is the limit's own subject.** This clause read
                                                     `32 / 15 / 17, the named ten-file list, … (seven, ten, three)`. All three were stale after the
                                                     perf probe's deletion took the workflow group 10 → 9, and the first also conflated two
                                                     populations under one headline — 32 is the WITHOUT-exclusion total, 15 / 17 was the
                                                     WITH-exclusion split, and neither pair is 32 / 15 / 17. The restatement pass that ran two lines
                                                     below ("Figures restated 2026-08-20 …") missed this paragraph. A limits section is the one place
                                                     a reader trusts to say what is unguarded, and it was itself unguarded: the guard computes the
                                                     cardinals but nothing anchors the META-claim about which cardinals are computed.
                                                     arithmetic. Read by hand and NOT computed: the sentinel / decision verdicts themselves,
                                                     which are a judgement and are deliberately not mechanised — a guard over them would be a check
                                                     comparing a judgement to a restatement of itself.
                                                     An earlier version of this limit claimed the pin figures were the only unguarded cardinals on the
                                                     page. That was false when written: seven, ten and three were prose, computable from sets the guard
                                                     already held, and the ticket's surviving conclusion below rests on two of them. A limits section
                                                     declaring an empty complement is this ticket's failure mode 4 landing in the paragraph written to
                                                     prevent it.

                                                  One correction to an earlier claim while these figures are being reconciled: 9 workflow-reading files
                                                  minus 6 read-only means **three already spawn a runtime**, so "there is no runtime in this repo to
                                                  feed them" is true of six files, not nine. Applied, not just noted: the two sites that carried that
                                                  wording are now phrased about the workflow PINS, for which the claim holds of all nine. Recording the
                                                  correction and leaving the sites standing is this ticket's failure mode 4, and it is what happened
                                                  on the first pass. Figures restated 2026-08-20 when the perf probe's deletion removed one
                                                  workflow-reading file; the three-spawn-a-runtime finding is unchanged by it.

- [x] **Decide a refactor cadence. DECIDED 2026-08-19: neither of the two options as posed.** A single sweep
      is unjustifiable at this population size with no failing signal, and pure opportunism has visibly not
      converged — this ticket has been open since 2026-04-28. The cadence is **risk-ordered, and it starts
      where a blind guard costs most**: the release and publish paths first, because a pin that cannot fail
      there passes a defect into a published artefact. That is not hypothetical — `release-watch.sh` was
      converted on 2026-08-19 for exactly that reason (see below), and its predecessor's pin matched a call
      that was commented out.
- [ ] **Convert the non-workflow population, release and publish paths first.** 22 files, of which the
      guards over `scripts/` are the tractable and highest-value subset: a shell
      predicate can be extracted to a file and fed inputs, which is what `scripts/scan-jobs.awk` now is.
- [x] **Give every pin that CANNOT be converted an explicit note saying what it cannot establish. SPLIT OUT
      2026-08-20 to P116, not dropped.** The work is unchanged and is still owed; only its ranking moved. It
      is S — nine files, one comment each — and this ticket is XL, so leaving it here priced a one-comment-
      per-file task at an 8x divisor and sank it from roughly rank 11 to rank 34. P116 carries it at WSJF
      12.0. The grain argument is this ticket's own, used a few lines above to reject a file-level ratchet
      for an assertion-level defect, and it applies to an effort rating just as well.

## RFCs

| RFC     | Status   | Title                                                                                              |
| ------- | -------- | -------------------------------------------------------------------------------------------------- |
| RFC-009 | proposed | Convert the source-inspection pin population to behavioural tests, release and publish paths first |

## Story Maps

| ID            | Title                                          | Status |
| ------------- | ---------------------------------------------- | ------ |
| STORY-MAP-001 | STORY-MAP-001: How a change reaches production | draft  |

## Stories

| ID        | Title                                                                                     | Status   |
| --------- | ----------------------------------------------------------------------------------------- | -------- |
| STORY-001 | STORY-001: A test that passes no matter what the code does is found and made able to fail | accepted |
