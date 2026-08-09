# Problem 097: A cucumber leg intermittently starts against an empty index

**Status**: Open
**Reported**: 2026-08-09
**Priority**: 9 (High) — Impact: Moderate (3) × Likelihood: Possible (3). **Re-rated 2026-08-09, same day, on a second instance — this ticket's own trigger fired within hours of it being written.** Impact 3: it fails the release gate, so no version can be published or deployed until someone re-runs it — the RISK-POLICY level-3 clause, with existing installs and the live service unaffected. Not 4: nothing reaches production, and `fail-fast` means the run stops immediately rather than reporting partial coverage. See Rating notes below.
**Origin**: internal — observed 2026-08-09, run `31284588346`
**Effort**: M — the fix is unknown until the race is characterised; the investigation is the work
**WSJF**: 4.5 — (9 × 1.0) / 2; was 3.0 at Priority 6
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Rating notes

**Likelihood 3 as of the second instance. The first rating's reasoning is kept below because it was right to be tentative, and the thing it warned about is what happened.**

Second instance: run `31292412669`, the retro commit, `build-and-test (3.5.0)`, `Run tests (geo)`, failing inside `test:nodejs:geo`. Identical assertion, identical scenario. Green on re-run.

**Third instance, 2026-08-09: run `31304736981`, commit `91994f8` (the post-ADR-044 stale-claim sweep), `build-and-test (2.19.5)`, `Run tests (geo)`.** `AssertionError: expected [] not to be empty` at `test/js/steps.js:241`, scenario `addressv2.feature:27`, `38 scenarios (2 passed, 35 skipped, 1 failed)` in `0m 0.114s`. The 3.5.0 leg passed on the identical diff, and the very next commit (`2916f57`, adding only docs) went green on both legs — so the content is exonerated twice over and this is the race, not a regression.

Three things this instance adds:

- **Both of the axes instance 2 opened are now confirmed as free.** Version: 2.19.5 → 3.5.0 → 2.19.5. Tier: nogeo → geo → geo. Neither is a property of the failure.
- **A red herring, with new observational evidence — folded into "What has been ruled out" below rather than restated here, since that section already carried the code-path grounds.** In short: the `Counts.csv` ENOENT appears on the passing leg too.
- **The failure is FAST, and that is diagnostic.** 0.114 seconds to first failure. The load completed and cucumber began querying essentially immediately — exactly the window a `waitport`-on-TCP readiness check leaves open, since the port accepts connections before the index is queryable.

**Not re-rated on this instance, and the reason matters because the obvious one is wrong.** The tempting argument — "three sightings in 24 hours is a same-day cluster, the denominator is thin" — does not survive this ticket's own first rating, which established that `--fail-fast` destroys the evidence distinguishing "index empty" from "one scenario wrong", so **the observed count is a censored floor, not a rate estimate**. Thinness pushes the true rate UP, not down; using it to hold the number down would be the under-observation bias this ticket names, applied to itself.

The real reason to hold at 3 is that the re-rate is not decision-relevant. Priority 9 is already High and above appetite, the top task was already named, and 9 → 12 moves WSJF 4.5 → 6.0 without changing what happens next — which is landing the readiness gate. That is what this instance did.

**Two framings in the first draft are now falsified, and both were mine.** It is not confined to one backend version — instance 1 was 2.19.5, instance 2 was 3.5.0. It is not confined to the nogeo tier — instance 1 was `test:nodejs:nogeo`, instance 2 was `test:nodejs:geo`. "One leg red, the other green" described a sample of one, not a property.

**What IS invariant across both, and is the sharpest signal in the ticket**: the failure is `test/resources/features/addressv2.feature:27` — the **first** `Search` scenario in the file — both times, immediately after the loader's `pretest:*` step completed. Same scenario, same assertion, different backend, different tier. A defect in the scenario or in the backend would not select the first query so precisely; a readiness race is the only candidate that predicts it.

**Original Likelihood 2 note, retained:**

**Likelihood 2, and the denominator is thin — stated rather than implied.** Observed once, on run `31284588346`, against roughly a dozen full matrix runs on 2026-08-09. Two things stop that being firm evidence for 2 over 3. The denominator is a same-day count, not a historical one. And `--fail-fast` destroys the evidence that would distinguish "index empty" from "one scenario genuinely wrong", so earlier instances may have been mis-attributed rather than absent — the same under-observation bias this ticket's Investigation Task 3 names. Re-rate to 3 if a second instance appears, and treat the absence of prior sightings as weak.

**This Priority prices the first-order effect only: the gate blocks and someone re-runs.** It does NOT price the desensitisation cost the Workaround and Impact Assessment describe — a real regression waved through by a reflexive re-run reaches RapidAPI consumers, which is Impact 4 under the policy, at a much lower likelihood and through a longer causal chain. Those are two different risks and averaging them into one cell would lose both. Recorded here so the number is not read as covering it.

## Description

`build-and-test (2.19.5)` failed at `Run tests (no geo)` while `build-and-test (3.5.0)` passed on the identical commit. The very first search scenario returned zero addresses and, under `--fail-fast`, took the rest of the run with it:

```
Failed scenarios:
  1) Search # test/resources/features/addressv2.feature:27
       Then the returned address list will contain many addresses
           AssertionError: expected [] not to be empty

37 scenarios (2 passed, 34 skipped, 1 failed)
```

Re-running the failed job on the same commit passed. So it is intermittent, and it is not the commit under test — that push was a devDependency upgrade (`js-yaml`) that the cucumber tier does not use.

## Symptoms

- One OpenSearch matrix leg red, the other green, same SHA.
- The failing assertion is a search returning `[]` — an empty or unready index, not a wrong result.
- `fail-fast` skips 34 of 37 scenarios, so the log shows one failure and no further signal.
- Re-run of the same job on the same SHA is green.

## What has been ruled out

**The fixture is present and correct.** The `Prepare OT test fixture` step succeeded and its listing shows the expected files — the Authority Code tables plus `OT_*` Standard tables. The G-NAF zip cache restored successfully.

**`Counts.csv` is a red herring — now on two independent grounds.** The log carries `Error: ENOENT: no such file or directory, access 'target/gnaf-fixture/Counts.csv'` at error level, which reads alarming and is not the failure. By code path: `loadGnafData()` in `service/address-service.js` treats the file as optional and falls back to `getFiles()` when it is absent, and the fixture has never contained it. By observation, added from instance 3: the identical ENOENT appears on the **passing** leg of the same run — 15 occurrences across run `31304736981`, including the green 3.5.0 job. Do not start here.

**But do not read it as exonerating the loader either.** The fallback the absent `Counts.csv` routes into IS the file-selection path R012 records as silently miscounting — a wrong filter there changes which files load and **the run still reports success**, with no behavioural test over the composition. So "the loader reported success" is not evidence the index was populated as expected, and a third root-cause candidate belongs below. An earlier version of this section concluded from the ENOENT being benign that the cause must be downstream of a successful load; that inference is unsound and is withdrawn.

**Not the change under test.** The push was `js-yaml` 4 to 5, a devDependency used only by three workflow-parsing tests in the `test:js` tier. It cannot reach the cucumber tier.

## Root Cause Analysis

Not established. The shape — index empty on the first query, on one backend version only, non-reproducible — points at a race between the loader finishing and the first query running, rather than at a load failure. Two candidates worth separating:

1. **The loader completed but OpenSearch had not refreshed.** A search issued before the index refresh interval elapses returns nothing on a freshly-written index. If the harness waits on the loader process exiting rather than on a refresh or a document count, that gap is real and version-sensitive.
2. **The server was ready before the index was.** `waitport` in `test/js/world.js` waits on the TCP port only, which is the same blind spot P094 recorded from a different angle — the port opening says nothing about the index behind it.

**Candidate 3, added 2026-08-09: the loader reported success while under-populating the index.** R012 records `filesToCount`'s file-selection branch as failing by silently miscounting rather than throwing, with the composition uncovered by any behavioural test — and the absent `Counts.csv` routes every fixture run into exactly that branch. This candidate predicts everything candidate 2 predicts: first query, empty result, no error anywhere, timing-dependent in that it depends on which files a race-varying enumeration returns. Nothing in this ticket excludes it. It is listed after candidate 2 rather than instead of it because the 0.114-second time-to-failure and the first-query selectivity are independent support for the readiness race — but the readiness gate landed for this ticket **discriminates between them**, which is the reason it asserts searchability and count separately and names which one it timed out on.

**Candidate 2 is now the leading one and candidate 1 is weakened.** A version-specific refresh difference cannot explain instances on both 2.19.5 and 3.5.0. The readiness gap can, and it predicts precisely what both instances show: the first query after load, empty result, timing-dependent, no error anywhere. It is also a known instrument gap in this repo rather than a fresh hypothesis — `waitport` waits on the TCP port, and the port opens before the index is queryable.

## Investigation Tasks

- [x] ~~Determine whether the two OpenSearch versions differ in default refresh behaviour.~~ **Answered by instance 2: the race is version-agnostic.** It has now fired on both 2.19.5 and 3.5.0, and on both the geo and nogeo tiers.
- [x] ~~Add a readiness precondition to the cucumber `Before` hook that asserts a known OT document is retrievable, not merely that the port is open.~~ **Landed 2026-08-09 as `test/js/index-ready.js`, called from `BeforeAll` in `test/js/world.js` after `esConnect()`.** It waits for two conditions, not one: a non-zero `count`, AND a `search` that can see those documents. Count alone would have returned green in the middle of the race — `count` reads the Lucene index while `search` reads the searcher, and those diverge for exactly the interval this exists to cover.

  **The error messages are the deliverable as much as the waiting is**, and it is why this discriminates candidates 2 and 3 rather than assuming one. Three exits, each naming what to look at: index absent (the load did not run, or ran against a different `ES_INDEX_NAME`), count 0 after the timeout (the loader ran and wrote nothing — with the R012 silent-miscount branch cited at the site), and count non-zero with search blind (the refresh race itself, with the count reported as the evidence separating it from an empty index). The symptom this replaces — `expected [] not to be empty` deep in a step — is consistent with all three, which is why three instances produced no diagnosis between them.

  **Both indices, not just the address one.** `localitiesv2.feature` asserts the same not-empty shape against a separate index with its own refresh. Gating only on the address index would have left that half exposed AND actively misled: a locality-side recurrence would print `index test-geo ready: N documents, searchable` immediately above an empty locality list, reading as evidence against the very race it is.

  Covered by six executing cases in `test/js/__tests__/index-ready.test.mjs`, mutation-proved three ways: replacing the searchability check with a constant fails 2 of 6, collapsing the missing-index branch into the empty-index one fails 1 of 6, and removing the per-probe deadline race hangs the suite outright. `ES_INDEX_NAME` is now exported from `client/elasticsearch.js` so the gate reads the resolved name rather than re-deriving it — a restated index name is how the P094 collision happened.

  **A per-probe deadline, because the loop's own deadline is only tested between probes.** A stalled `count` or `search` would sail past it and consume the 240-second `BeforeAll` budget instead of the gate's 60, trading the three specific messages for a generic cucumber hook timeout — which is the diagnosis-free outcome this ticket already has. Each probe now races the remaining time and falls THROUGH to the diagnostic block rather than propagating, because "the probe ran out of time" is how we stopped looking, not what we found.

  **Exercised against a real OpenSearch before landing, and that is what found the last defect.** The gate had been proved only against a hand-written stub — which encodes the same assumptions it is meant to test and so cannot disconfirm them. Run against OpenSearch 3.5.0 with the OT fixture loaded (5,186 addresses, 15 localities): the nogeo tier passes 37/37, and pointing the gate at a missing index reported **the wrong message** — `did not answer within 60s`, when the client had in fact thrown a clean 404 on every one of roughly 240 polls. The final probe raced the arriving deadline and lost, and one lost race discarded 240 answers. The rule is now that ANY observation beats a stall: a stall is reported only when the loop learned nothing — no count and no 404 either. Re-verified live in both directions afterwards, and pinned by a regression case whose stub reproduces the shape (answer, then hang) rather than the timing.

  **And a second defect the local run hid, caught by CI and then reproduced locally rather than guessed at.** The deadline timer was `unref`'d, so that a race won by the probe would not hold the event loop open. With a probe that never settles, that timer is the only pending handle — Node drains the loop mid-wait and `node:test` reports `Promise resolution is still pending but the event loop has already resolved`. All three CI jobs went red; the local run had not, because other handles happened to be alive. Reproduced by running the suite in `node:22.7-slim` (the declared engine floor), confirmed the `unref` version fails there and the fix passes, and only then pushed. The timer is now CLEARED when the race settles, which gives both properties: the loop stays alive while the gate is genuinely waiting, and is released the moment it is not.

  **A stalled probe is a FOURTH state and says so.** The first version fell through into the missing-index message: `index "X" does not exist ... the load did not run` — confident, specific, and wrong, since a probe that never answered tells you nothing about the index. That is the same conflation-of-causes this module exists to remove, reproduced one level in. It now reports that the backend accepted the connection and stopped responding, and points at the container rather than the loader.

- [x] **A second guard, for the defect this fix nearly shipped.** The first version of the wiring imported `../index-ready.js` from `test/js/world.js`, where the module is at `./index-ready.js` — the specifier was copied from the test file, which is one directory deeper and where the same string is correct. `npm run test:js` was 392/392 with that in the tree, because `test:js` globs `test/js/__tests__/*.test.mjs` and never loads `world.js`. It would have failed at `BeforeAll` on every scenario of every tier at once, turning an intermittent red into a permanent one — the exact hazard this ticket is about, arriving through the fix for it. `test/js/__tests__/cucumber-support-imports-resolve.test.mjs` closes it, in two cases. Static analysis rather than importing the files, because importing `world.js` outside a cucumber run throws from cucumber's own not-running guard.

  **Its inventory is READ from `cucumber.js`, not restated** — it parses `IMPORT_GLOB` and walks that root recursively, and fails loudly if the glob is renamed or stops being recursive. Its own first draft is the argument for that: it walked `test/js/` non-recursively while the runner's glob is `test/js/**/*.js`, so it checked six of nine files and left the three drivers unguarded — one of which reaches four directories up into `src/`. A restated inventory drifts silently.

  **And it checks bindings, not just paths.** `import { awaitIndexReady } from './index-ready.js'` with the name misspelt resolves clean and fails at `BeforeAll` exactly as a wrong path does. Mutation-proved three ways: the real path bug, a typo'd binding, and a broken specifier inside a driver — each reported by file and target. Scope stated at the top rather than left to be found: bare specifiers are npm's problem, and re-export chains are skipped rather than guessed at, because a false red here would train people to ignore the guard.

- [ ] File the second-order desensitisation cost as its own standing risk in `docs/risks/`, or attach it to R023 (gate-signal trust from the lying-green side; this is the crying-wolf side). The Rating notes above exclude it from this ticket's Priority deliberately, and an exclusion with no carrier is a deferral into prose — it discharges when the entry exists, not when it is planned. Deliberately NOT bundled into the retro commit that raised it: a curated above-appetite entry moves the register's above-appetite partition, which the bolded-partition invariant enforces across `docs/`, and that is a batch of its own.
- [ ] Decide whether `--fail-fast` is right for this tier. It saves CI minutes and it also destroys the evidence needed to tell "index empty" from "one scenario wrong" — here it skipped 34 scenarios that would have distinguished them.

## Workaround

Re-run the failed job. It passed on the first re-run. This is a procedural control and is not credited as a fix — an intermittent red on a release gate trains people to re-run reflexively, which is how a real regression gets waved through.

## Impact Assessment

It blocks the release gate. The `release` job depends on `build-and-test`, so a red leg means no publish and no deploy until someone notices and re-runs. The worse cost is the one the workaround creates: an intermittent failure on a gate teaches everyone that red does not necessarily mean broken.

## Related

- [P094](../closed/094-published-package-with-geo-enabled-is-tested-by-nothing.md) — its recorded residue is that `waitport` waits on the port only and cannot see the index behind it. Candidate 2 above is that same gap producing a different symptom, which is why the readiness-precondition task appears on both.
