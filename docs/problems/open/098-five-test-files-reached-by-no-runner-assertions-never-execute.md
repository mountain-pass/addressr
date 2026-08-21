# Problem 098: Test files whose assertions never execute — no runner reaches them, or nothing invokes their runner

<!-- The filename keeps the original slug: it is an identifier, not a description (R027 precedent). The H1 carries the corrected scope. The first title said "five test files ... reached by no runner", which was wrong on both axes once `test/precommit/*` was promoted in — those ARE reached by a glob; nothing invokes the script. A ticket titled after its triggering instance can be closed while the class runs live, which is the R022 rescue R027 records, and it would be this ticket's own thesis failing on its own title. -->

**Status**: Open
**Reported**: 2026-08-09
**Priority**: 10 (High) — Impact: Minor (2) × Likelihood: Almost Certain (5). **Re-derived at capture, before the first commit, against the R018 / R028 calibration rather than by feel.** Impact 2, not 3: `RISK-POLICY.md` Impact 3 has two clauses — publish/Docker/deploy disruption, and confidential metrics in the public repo — and neither reaches. Impact 2 is "no end-user impact; developer experience or build tooling only", and names CI-workflow and lint-config changes as exemplars. R028 faced the identical pull toward 3 for governance-record harm and landed on 2 ("not Impact 1, because this is a machine-consumed surface rather than inert prose"); departing upward here would make this ticket incomparable with it. Likelihood 5, not 4: the risk is not probable, it is **realised and continuous** — ADR-025's Confirmation criterion 1 rendered into the compendium as satisfied by a file that has never executed, and re-realised on every architect run until it was marked on 2026-08-09. R018 is the in-repo precedent for that reading: same artefact class, realised repeatedly before anyone looked, Likelihood 5.
**Origin**: internal
**Effort**: M — derived at capture: five files, two of which are settled and need execution rather than a decision, plus two ADR Confirmation criteria to re-point at instruments that execute, plus the mechanised check.
**WSJF**: 5.0 — (10 × 1.0) / 2
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

`package.json` declares **four** `node --test` scripts:

| script                    | glob                           | invoked by                                                        |
| ------------------------- | ------------------------------ | ----------------------------------------------------------------- |
| `test:js`                 | `test/js/__tests__/*.test.mjs` | `pre-commit`, and `release.yml`                                   |
| `test:integration:search` | `test/integration/*.test.mjs`  | `release.yml:183`                                                 |
| `test:precommit`          | `test/precommit/*.test.mjs`    | **nothing** — see below; this is the worst instance in the ticket |
| `test:mcp:smoke`          | `test/mcp/smoke.test.mjs`      | nothing, **and that is the decision** — ADR-020 makes it opt-in   |

Five test files are reached by **none of the four** and have therefore never executed:

| file                                      | what it asserts                                                                                                                 | why it matters                                                                                                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `service/address-service.test.js`         | `mapAddressDetails` populates `ssla === sla` for street-level addresses and a distinct short form for sub-unit addresses        | **ADR-025 names this file BY PATH as Confirmation criterion 1.** The compendium renders that bullet first, so the routine architect load surface reported the criterion as held. |
| `client/__tests__/elasticsearch.test.mjs` | a P036 sibling structural guard: `client/elasticsearch.js` imports `buildClientNode` rather than rebuilding the node URL inline | drift guard with nothing behind it                                                                                                                                               |
| `test/lint/all-rules.test.js`             | `eslint .` reports zero errors                                                                                                  | the standing instrument for the lint ratchet — see "Why it bites now"                                                                                                            |
| `test/lint/abbreviations.test.js`         | (unaudited)                                                                                                                     | —                                                                                                                                                                                |
| `test/js/locality-search.test.js`         | locality search unit tests                                                                                                      | P020's explicit deferral; its stated blocker has since lifted                                                                                                                    |

`deploy/cloudflare-worker/worker.test.js` is **NOT** an orphan and must not be swept up with these: ADR-032 names its runner explicitly, which makes it a manual instrument rather than a dead one.

### `test/precommit/*` — scripted but never invoked, and it is the sharpest instance here

This started life as a footnote about a "sibling class" and is promoted, because the severity argument is stronger for these two files than for any of the five above: **JTBD-400 asserts in prose that a guard exists, and the guard does not execute.**

`pre-commit` is `lint-staged && check-licenses && check:not-cli2-tags && test:js`. `test:precommit` is invoked by nothing — no workflow, no husky hook — and referenced only at its own declaration in `package.json`. [P011](../closed/011-lint-staged-drops-changeset-files.md) ticks `- [x] Wire the regression test into \`npm run test:precommit\``, and **that tick is honest at the level it was written** — the test IS wired into the script, and P011's own prose claims no more than *"Runs via `npm run test:precommit`"*. The gap is one level up and nobody claimed it: the script itself has no caller. An earlier draft of this ticket read that tick as a box ticked without the work; that was wrong, and against a closed ticket that cannot answer. So:

- `test/precommit/changeset-preservation.test.mjs` is the named instrument of JTBD-400's Desired Outcome _"A regression test proves that a commit staging a `.changeset/*.md` plus the typical ef66d39-class fileset retains the changeset in `HEAD` after the pre-commit hook runs"_ — the guard against the P011 incident where a release shipped no version bump. It has never run.
- `test/precommit/not-cli2-tags.test.mjs` pins the Desired Outcome _"Test-profile exemption tags carry mandatory cross-references; their addition fails the commit if the cross-reference is missing"_. Note the asymmetry: the **checker**, `check:not-cli2-tags`, does run in the pre-commit chain. The **test of the checker** does not.
- JTBD-400's Job Story on lint-staged silent-drop says the class is _"guarded by a regression test so it cannot regress unnoticed"_. That sentence is currently false.

**`test:mcp:smoke` is NOT part of this** and must not be swept in. ADR-020 decides its non-invocation deliberately — _"Tests live in `test/mcp/` and run via `npm run test:mcp:smoke`. They are not included in the standard `test:nogeo` pipeline"_, with "opt-in, cannot break CI when `RAPIDAPI_KEY` is absent" as a listed consequence. Wiring it into the standard pipeline would contradict that. **Rest the exclusion on that text, not on the ADR's authority** — ADR-020 is `status: proposed` with `human-oversight: confirmed` (`docs/decisions/020-mcp-smoke-testing.proposed.md:2-4`), so it is ratified but not adopted, and either framing would be a weaker basis than the sentence itself.

And the exclusion is narrower than "decides its non-invocation deliberately", which over-reads it. What ADR-020 decided is that the tests are out of `test:nogeo`. Its Confirmation criterion 1 is _"`npm run test:mcp:smoke` passes with `RAPIDAPI_KEY` set"_ — a decision that requires the script to pass is not a decision that it never runs, and that criterion records no evidence of ever having been met. Same defect shape as ADR-025's criterion 1, different cause: unrun rather than unreachable. Recorded, not acted on.

`test:integration:search` is the counter-example that shows the check is discriminating: declared AND invoked, at `release.yml:183`. Verified 2026-08-09.

### This is a distinct class from P033, and only P033 is tracked

[P033](../closed/033-source-inspection-tests-anti-pattern.md) is about tests that **run but assert on source text**. This ticket is about tests that **assert behaviourally but never run**. Both manufacture false coverage and both survive review for the same reason — the file path and the `describe()` titles imply the contract is exercised. P033 has a 16-priority rating and an active conversion programme; this class had no ticket at all until now.

### Why it bites now

On 2026-08-09 `unicorn/prefer-module` was enabled at `error` on a measured zero-violation repo-wide run, removing a suppression whose stated blocker (ADR-005) had died with ADR-044. `test/lint/all-rules.test.js` is precisely `eslint . → zero errors` — it is the standing instrument that would hold that ratchet, and it is orphaned. The measurement is a one-shot with nothing behind it.

Even un-orphaned it would hold less than its name suggests. It filters `message.severity === 2`, so it is blind to:

- the **ten** `warn` rungs set explicitly in `eslint.config.js` — `unicorn/name-replacements`, `unicorn/no-this-outside-of-class`, `promise/always-return`, `promise/catch-or-return`, `n/no-deprecated-api`, `no-process-exit`, `complexity`, `max-lines-per-function`, `max-depth`, `max-params`;
- **at least four more** supplied by `importX.flatConfigs.warnings` — `import-x/no-named-as-default`, `no-named-as-default-member`, `no-rename-default`, `no-duplicates`, all severity 1.

Four is a floor, not a total: the unicorn, promise and n recommended sets are unaudited. And there is no repo-wide `eslint .` run in CI at all — enforcement is `lint-staged` alone, whose pattern is `*.{js,jsx}`, so the `.mjs` corpus is never linted at commit time.

### The ADR-033 sub-finding

ADR-033 Confirmation 2 pins **no file path** — it says "unit-tested both branches" without naming the instrument. During the 2026-08-09 sweep that let `client/__tests__/elasticsearch.test.mjs` be misattributed to it; the criterion is actually held by `test/js/__tests__/es-auth.test.mjs`, which does run. This is a [P076](076-adr-confirmation-items-can-be-prescribed-and-never-implemented.md)-class gap — a Confirmation item prescribed and never bound to an instrument — and it is why the misattribution was available in the first place.

## Symptoms

- A Confirmation criterion reads as satisfied in `docs/decisions/README.md` while its named instrument has never executed.
- A regression in the guarded behaviour passes pre-commit and CI without any signal from the file written to catch it.
- A newly-enabled lint rule has no standing check holding the measurement that justified enabling it.

## Workaround

Run the file directly: `node --test service/address-service.test.js`. P020 offered the same shape of workaround in April — _"Run manually: `node --test test/js/proxy-auth.test.js` etc."_ — and a manual workaround is not a control. Note what that citation does NOT say, because an earlier draft of this line got it backwards: the file P020's Workaround names is `proxy-auth.test.js`, which P020 then un-orphaned; `locality-search.test.js` is in its Related and Follow-up, not its Workaround. The workaround shape recurs; the specific file does not.

## Impact Assessment

- **Who is affected**: Addressr Contributor / Maintainer (JTBD-400 — "no test coverage silently erodes"). Note JTBD-400's `screens:` list contains no `test/` path, so the job that owns this class does not currently reach the files.
- **Frequency**: continuous — every commit and every release.
- **Severity**: Minor by RISK-POLICY's bands — developer tooling and the governance record, no end-user path. Bounded further by independent live cover: ADR-025's substance is carried by its un-skipped P007 Cucumber scenario and by ADR-027's pins in `test/js/__tests__/address-service.test.mjs`, both of which run, so an `ssla` regression would still be caught in CI. The exposure is to the RECORD (a criterion that lies about being held) and to the lint ratchet (which has no cover at all).
- **Analytics**: N/A.

## Root Cause Analysis

### Investigation Tasks

One task per file, because five decisions inside one checkbox can only be ticked prematurely or block indefinitely — and two of the five are not decisions at all, they are already settled below and written as answers rather than questions.

- [ ] **`test/js/locality-search.test.js` — WIRE IT.** Not an open question. P020 left this orphaned because moving it into the active glob exposed extensionless Babel-dependent imports in `service/address-service.js`; ADR-044 retired Babel on 2026-08-08 and the module now resolves under raw Node ESM with 15 exports. The stated blocker has lifted, so the scope-expanded fix P020 deferred is probably unnecessary. Move it into `test/js/__tests__/` as `.mjs` and confirm green. What remains is execution, not a decision.
- [ ] **`service/address-service.test.js` — MIGRATE, then re-point ADR-025.** Also not an open question. Deleting it without replacement is closed off, because ADR-025 Confirmation criterion 1 names it by path; wiring it where it sits is closed off, because `service/*.test.js` is not a runner location. Move the assertions into `test/js/__tests__/` and re-point ADR-025 at the migrated file. The ADR body already records that its named instrument does not execute — that is a marker, not a fix.
- [ ] **`client/__tests__/elasticsearch.test.mjs` — decide.** A P036 structural drift guard. Genuinely open whether the guard is still worth holding: `buildClientNode` may now have behavioural cover that subsumes it.
- [ ] **`test/lint/abbreviations.test.js` — decide.** Unaudited; read it first. It may be superseded by `unicorn/name-replacements`, which is live at `warn`.
- [ ] Pin a file path on ADR-033 Confirmation 2, per the P076 class.
- [ ] **`test/lint/all-rules.test.js` — the one genuinely undecidable case.** Decide what it should assert given `eslint .` is red at 436 errors (P084's known debt). As written it would fail on unrelated debt and be waived — a gate waived on arrival is worse than none. A baseline-delta shape, or scoping to the rules P084 has ratcheted, are the two candidates.
- [ ] **File the decision-record-trust ticket** named in the Scope boundary below, and re-home P076 onto it. Carried as a task rather than left as prose: a deferral with no checkbox and no reserved number is the shape that evaporates, which is the pattern this ticket exists to name.
- [ ] **Mechanise the class — do this one first if only one gets done.** It is the only task that discharges the class rather than the instances. Assert that every `*.test.{js,mjs}` outside `node_modules`/`lib`/`target` is either matched by a runner glob AND reachable from an entry point, or carries an explicit exemption naming its runner (the `deploy/cloudflare-worker/worker.test.js` shape). It must cover the sibling class above — scripted-but-never-invoked — not just reached-by-no-runner. **Build it off a freshly derived glob inventory**, not off any sentence in this ticket: the first draft of this ticket, and ADR-025's marker, both asserted that only one `node --test` glob existed. There are four. A structural claim about the build surface with nothing recomputing it is the defect this task exists to remove, so do not baseline it off one.
- [ ] **Adopt P020's never-done ADR-009 amendment**, promoted here from a Related bullet because the mechanised check needs a convention to check AGAINST. P020's architect review recommended declaring the `node --test` complement to Cucumber and the `test/*/__tests__/*.test.mjs` convention — including why `.mjs` matters, which is that it keeps Cucumber's `test/js/**/*.js` require-glob from loading them. Deferred in April and still undone; re-observing that deferral without adopting it would reproduce the pattern this ticket exists to name.
- [ ] **Wire `test:precommit` into an entry point** — the pre-commit chain or a CI step. Two JTBD-400 Desired Outcomes and one Job Story assert these guards exist. Whichever way it goes, the prose has to end up true.
- [ ] **Widen JTBD-400 on the RUNNER-WIRING axis only, not to `test/**`.** JTBD-400 legitimately owns "does a declared entry point reach this file": it screens `pre-commit hook chain` and its `package.json` screen is already qualified by clause (_"release surface only — version, changesets config, build:docker / docker:push scripts, and the deploy:\* scripts"_), so extend that clause from "release surface only" to also cover the `test:*` script block. Add a Desired Outcome along the lines of "every committed test file is reachable by a declared entry point, or carries an exemption naming its runner". Adding `test/**` to `screens:` would be wrong: it would route every Cucumber feature edit to the maintainer job and collide with the behavioural surface of JTBD-001/002/003/200/201.
- [ ] **Cross-reference the LOST ASSERTIONS to their owning jobs, per file — they are not maintainer-side.** Only `test/lint/all-rules.test.js` and `test/lint/abbreviations.test.js` are. `service/address-service.test.js` asserts the `ssla` symmetry behind JTBD-001's Desired Outcome _"Correct address appears in the first page of results for reasonable queries"_, over a file screened unqualified by JTBD-201 (`screens: service/address-service.js`) and, with a clause that does NOT cover `mapAddressDetails`, by JTBD-203 (`service/address-service.js (fetchGnafFile / unzipFile / loadGnafData)`) — so JTBD-201 is the second owner, JTBD-203 only adjacent. `client/__tests__/elasticsearch.test.mjs` guards `client/elasticsearch.js`, which is a JTBD-201 screen verbatim. `test/js/locality-search.test.js` (41 lines, resolved 2026-08-09 by reading it) carries **six** assertions across **two** modules: `searchForPostcode`, `searchForState`, `searchForLocality` and `getLocality` over `service/address-service.js`, plus `initLocalityIndex` and `dropLocalityIndex` over `client/elasticsearch.js`. The first four sit behind all four of JTBD-002's screens — `/localities`, `/postcodes`, `/states`, `MCP search-localities, search-postcodes, search-states` — and `/localities` is the one covering `searchForLocality`. The last two make this file **co-owned by JTBD-201**, on the same grounds stated earlier in this task for `client/__tests__/elasticsearch.test.mjs`: `client/elasticsearch.js` is a JTBD-201 screen verbatim. (An earlier draft said "the next bullet", which pointed at nothing — the clause precedes rather than follows, and this is the last task in the list.) An earlier draft of this bullet said three exports over one module and named three of JTBD-002's four screens, while getting JTBD-203's limiting clause right in the same sentence — the ADR-033 misattribution shape at the top of this ticket, recurring one section below it. Absorbing all five into JTBD-400 would claim maintainer ownership of runtime-job assertions.

### Scope boundary: this ticket is the RUNNER-REACHABILITY defect, not decision-record trust

The ADR-025 half — a Confirmation criterion that renders first on the architect's routine load surface and reads as satisfied when its instrument has never executed — is **served by no documented job.** No JTBD screens `docs/decisions/`, the compendium, or the architect load surface. JTBD-400's "no test coverage silently erodes" stretches to the orphaned-runner half; it does not stretch to "a ratified decision asserts confirmation it does not have", and the maintainer persona's pain points name commit-tooling footguns and manual release steps, nothing about the record misreporting its own evidence.

Deliberate disposition: **this ticket is scoped to runner reachability.** The decision-record-trust question is recorded here as a named gap and belongs in its own ticket, with a provisional job statement of roughly _"help the maintainer trust that a governance artefact's claims about other artefacts are true, so a green-reading record is evidence rather than assertion"_ and screens over `docs/decisions/**`, `docs/problems/**` and `docs/jtbd/**`.

**That scope is deliberately wider than the ADR-Confirmation half**, because a narrower one would let the class escape the ticket reserved for it — the evaporation shape this ticket warns about two paragraphs up. Two defect shapes, not one. The first is a Confirmation criterion naming an instrument that does not execute (ADR-025 unreachable, ADR-020 unrun). The second is an artefact **characterising** another artefact's status, subject, section or member-list wrongly, and every instance found while writing this ticket was that second shape and lived outside `docs/decisions/`: a JTBD screen count, a JTBD screen clause, a closed ticket's Workaround attributed backwards, an ADR labelled with a different project's ADR of the same number, and a pointer to a bullet that does not exist. `docs/decisions/` is where the first shape lives; the second is repo-wide.

Not filed as a risk-register entry, deliberately: R028 already owns this class ceiling at residual 6 — its own words are that the register is closed wherever a number lives in a checkable cell and open wherever it lives in a sentence — so a new entry would restate that ceiling under a new number rather than close anything. That it already has two live instances — ADR-025 criterion 1 (unreachable) and ADR-020 criterion 1 (unrun) — argues the gap is systemic rather than a one-off. A third piece of evidence is P076 itself: it carries `JTBD: JTBD-001` with `Persona: addressr-maintainer`, a mismatched pair, because the decision-record class had no home and was force-fitted onto a runtime job. The deferred ticket should re-home it. This and it composes with [P076](076-adr-confirmation-items-can-be-prescribed-and-never-implemented.md) rather than duplicating it: P076 is about criteria never implemented, this is about criteria implemented and never executed.

### Every claim this ticket makes about another artefact was resolved against its source

Stated because this ticket's own thesis is that a claim nobody recomputes is not evidence, and the first draft failed it. A risk-scoring pass audited roughly half the cross-artefact assertions here and found **four wrong** — all four were characterisations wrapped around quotes, never the quotes themselves, which were exact five for five. The failures were: ADR-020 called ratified-and-therefore-binding when the binding thing is its Decision Outcome text; ADR-032 labelled with a different project's ADR-032 subject; a JTBD-400 screen described as a persona constraint; and P011's honest tick read as a box ticked without the work.

The remainder were then resolved by reading each source on 2026-08-09: P020's Priority line, JTBD-002's screens, JTBD-201's and JTBD-203's screen lists including JTBD-203's limiting clause, `test/js/locality-search.test.js`'s exports, ADR-032's Confirmation line, and the `eslint.config.js` `warn` enumeration. Those characterisations are quote-plus-path, so each carries its own citation. Not a completeness claim: an earlier draft of this sentence said "throughout", and the very next scoring pass falsified it by opening `test/js/locality-search.test.js` and finding the bullet above wrong in three ways. What is claimed is the list, the date, and the finding — nothing wider.

**None of that is a control.** It is one careful pass, and a careful pass is what the first draft also was. The mechanised check task below is what would actually hold this — and note that its scope is narrower than the defect found here: it can check runner reachability, but nothing yet checks that an artefact's characterisation of another artefact's status, subject or section matches. That is a real gap and belongs on the decision-record-trust ticket.

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: [P084](084-eslint-10-and-unicorn-72-leave-a-deliberate-lint-debt-with-no-ci-gate.md) — the lint-debt half. P084 owns what `eslint .` should be allowed to report; this ticket owns the fact that nothing runs it.

## Related

- [P020](../closed/020-orphan-node-test-files.md) (closed 2026-04-19) — the prior instance of this class. It found three orphans, fixed two, and explicitly left `test/js/locality-search.test.js` in place; its Fix Released section names the blocker, which ADR-044 has since removed.

  **Why this is a new ticket rather than a reopen, and the argument is SCOPE, not count.** P020 scoped itself to `test/js/*.test.js` — its title says so and its first investigation task reads "Inventory all `test/js/**/*.test.js`". Two of the five files here, `service/address-service.test.js` and `client/__tests__/elasticsearch.test.mjs`, were never in that search space at all. Reopening would silently retro-widen P020's scope and make its completed inventory tick false in retrospect. It would also put a released, correct fix back into an unreleased state: P020 really did take `test:js` from 1 test / 1 suite to 12 / 4. And keeping both preserves the most useful thing the pair says — the class was rated `3 (Low) — Impact: Negligible (1) x Likelihood: Possible (3)` in April (P020 line 6, quoted) and is rated 10 in August, which is itself the evidence for prioritising the mechanised check.

- [P033](../closed/033-source-inspection-tests-anti-pattern.md) — the sibling false-coverage class (runs but asserts on source text). Distinct mechanism, same reviewer trap.
- [P076](076-adr-confirmation-items-can-be-prescribed-and-never-implemented.md) — ADR Confirmation items prescribed and never bound to an instrument; ADR-033 Confirmation 2 is an instance.
- [P084](084-eslint-10-and-unicorn-72-leave-a-deliberate-lint-debt-with-no-ci-gate.md) — the lint debt `test/lint/all-rules.test.js` would fail on.
- ADR-025 (symmetric `ssla` search ranking) — its Confirmation criterion 1 names an orphaned file; the ADR body now says so.
- ADR-033 (OpenSearch IAM SigV4 auth) — Confirmation 2 pins no path.
- ADR-032 (Cloudflare Worker deployed via Terraform, not Wrangler) — its Confirmation names `node --test deploy/cloudflare-worker/worker.test.js` explicitly, which is what makes that file a manual instrument rather than an orphan. The title correction is worth noting: the first draft of this ticket labelled ADR-032 "governance skill invocation patterns", which is a DIFFERENT project's ADR-032. The citation number was live and only its subject was wrong — the exact rot JTBD-400 records against itself at the ADR-014/ADR-001 line, reproduced here while quoting the file that documents it.
- ADR-009 (Cucumber BDD acceptance testing) — P020's deferred follow-up. Now carried as an investigation task above rather than left as a bullet.
- Surfaced by the risk scorer during the 2026-08-09 post-ADR-044 stale-claim sweep, which enabled the lint rule whose instrument turned out to be orphaned.
