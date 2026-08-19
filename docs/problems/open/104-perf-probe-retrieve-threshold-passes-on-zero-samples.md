# Problem 104: The perf probe's retrieve threshold passes on zero samples

**Status**: Open
**Reported**: 2026-08-19
**Priority**: 8 (Medium) — Impact: 2 × Likelihood: 4 — rescored 2026-08-19 from 12 (3×4).
Impact 3 is reserved for a disrupted publish, image-build or deploy pipeline; this probe is advisory and
gates nothing, which is Impact 2 ("no end-user impact; only developer experience or build tooling").
The 12 double-counted: it took Impact from the harm an undetected regression would cause and Likelihood
from how often the defect fires. Those are two different events. Likelihood 4 is kept because the false
tick is present on every run and actively misinforms, which is more than Possible. **The 12 also inverted
the parent ordering** — it put this above P032 (9), the ticket whose uncovered surface this is one leg of.
**Origin**: internal
**Effort**: S — derived at capture per Step 4a
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

Half the nightly perf probe measures nothing, and it reports a tick.

`test/k6/regression.js:119` reads `results[0].links.self.href`. The search response carries no `links` object, so **every iteration throws** `TypeError: Cannot read property 'self' of undefined` immediately after the two search checks. The `retrieve` request is never issued.

Its threshold is `http_req_duration{phase:main,name:retrieve}: p(95)<1000`. A percentile over an empty sample set satisfies that trivially, so k6 prints:

```
✓ 'p(95)<1000' p(95)=0s
```

with `avg=0s min=0s max=0s`. The run exits 0 and the CI step prints _"perf regression probe passed every threshold"_.

### Evidence

Verified on run `32203592902` (2026-08-19, `f7936ae6`) — the **first Perf Regression run to reach k6 since 2026-08-12**, dispatched to validate the P032 referrer repoints:

- `scenario=regression`: **21,860** throws. `scenario=warmup`: 2,677. Every iteration in both.
- `checks_succeeded: 100.00% 49074 out of 49074` — exactly **2.0 checks per request**, the two search checks. The `retrieve is status 200` check never ran.
- `http_reqs: 24537`, all attributed to `{phase:main,name:search}`; `{phase:main,name:retrieve}` has no samples.
- Search itself is healthy: `p(95)=28.2ms` against a 1500ms threshold, `http_req_failed 0.00%`.

## Symptoms

1. The retrieve latency threshold cannot ever fail, so a retrieve-path regression is undetectable by this probe.
2. The probe reports success with a tick against the very metric it did not collect, which is worse than reporting nothing.
3. `test/js/__tests__/perf-regression-workflow.test.mjs` pins the exit-code wrapper shape and is green, so nothing in the suite contradicts the false signal.
4. The throw is logged at `level=error` on every iteration and did not prevent a green run — 24,537 error lines that nobody read, which is P101's defect compounding this one.

## Workaround

Read `{phase:main,name:retrieve}` in the k6 summary and treat `p(95)=0s` as "did not run" rather than "instant". Operator memory, which is what JTBD-400's checkable-artefacts outcome exists to remove.

## Impact Assessment

- **Who is affected**: the maintainer relying on the nightly perf signal.
- **Frequency**: every run for which k6 output exists. Runs from 2026-08-12 to 2026-08-17 died at
  `genversion` before reaching k6, and 2026-07-26 to 2026-08-12 is unaccounted for — so "since the probe
  was written" is inference, not evidence, even though the cause below makes it near-certain.
- **Severity**: Minor. No production impact — the probe measures a seeded local instance and gates nothing. The cost is a guard believed to cover two paths that covers one, and reports the uncovered one as passing.
- **Analytics**: 21,860 measured-phase iterations, 0 retrieve requests, 1 tick.

## Root Cause Analysis

Two independent faults compose.

**The response shape — RESOLVED 2026-08-19. The probe is the defect; the API is to contract.**
`results[0].links.self.href` does not exist on the search response and no code path produces it:

- `packages/addressr/src/waycharter-server.js` collection loader maps each hit to exactly
  `{ sla, ssla?, highlight, score, pid }`. No `links` key, and no branch that could add one.
- waycharter emits item links as RFC 5988 `Link` **headers** with JSON-pointer anchors, never as a `links`
  object in a body item.
- Confirmed against a live production response for `q=1 george st sydney`: body items carry
  `{sla, ssla, highlight, score, pid}`, and the retrieve URL arrives as a `Link` header
  `rel=canonical; anchor="#/0"` → `/addresses/GANSW710278999`.

So there is no regression and nothing to repoint on the service side. **The fix is
`` `${BASE_URL}/addresses/${results[0].pid}` ``** — which reproduces the canonical link header character for
character, from a field the body already carries.

Corroborating the authoring-assumption reading rather than a shape that regressed: the probe's own comment at
`test/k6/regression.js:116-118` asserts "this href comes back from the server already encoded" — an in-code
claim about a shape no code produces.

**k6 thresholds have no non-empty floor.** A threshold over zero samples passes. This is the third appearance of that class in this repo in one day — `workflow-npm-scripts-resolve.test.mjs` and `doc-links-resolve.test.mjs` both gained explicit corpus floors on 2026-08-18 for exactly this reason, and ADR-048's Confirmation criterion 5 records it as a named requirement. k6's own engine offers no equivalent, so the floor has to be asserted outside it.

### Investigation Tasks

- [x] **Establish which side is wrong. DONE 2026-08-19 — the probe is.** Settled from the response-construction
      code and a live production body, both of which outrank the OpenAPI document the task originally proposed
      distrusting, and neither of which needed a CI run. See the RCA above.
- [x] **DONE 2026-08-19.** Repoint the retrieve leg to `` `${BASE_URL}/addresses/${results[0].pid}` ``, and drop the stale
      already-encoded comment at `:116-118` — a `pid` needs no encoding. Deleting the leg is no longer on the
      table now that the retrieve path is known to be exercisable.
- [x] **Add a non-empty floor for every threshold. DONE 2026-08-19, but NOT via `handleSummary`.** The task
      proposed `handleSummary`; that requires importing k6's `textSummary` from `jslib.k6.io` to keep the
      human-readable stdout report, which would make a nightly job depend on reaching a third-party host at
      run time — a new way for the probe to fail, to fix a way it reported falsely. Used
      `--summary-export=target/perf-summary.json` instead: built in, no network, and it leaves the stdout
      summary alone. A `count>500` threshold on `http_reqs{phase:main,name:retrieve}` is the floor itself.
- [x] **Route k6 script exceptions to a non-zero exit. DONE 2026-08-19, by consequence rather than
      directly.** An in-iteration throw is still invisible to k6's exit code — but a throw before the
      retrieve call means no retrieve requests, which the count floor and the validity check both catch. The
      throw is detected by its effect on what was measured, which is the property that actually matters;
      detecting the throw itself would still leave a probe that measured nothing for any other reason.
- [x] **Separate an invalid probe from a slow one. DONE 2026-08-19 — this closes the ZERO-SAMPLE subclass
      of P032's named residual, not the whole of it.** An earlier draft of this task said it closed the
      residual outright; that overstated what was built and is corrected here. k6 exits 99 for
      both, so the exit code cannot route them; `scripts/perf-validity.mjs` reads the exported summary and
      the workflow routes on it. A latency breach with samples stays advisory; a leg that measured nothing
      is now as loud as a probe that failed to start. The check runs on the CLEAN path too, so "passed every
      threshold" is earned rather than assumed.
      **What is closed:** a leg that collected nothing. That covers both historical instances — a rerun of
      2026-07-25 returns 400s on search, so `results.length > 0` never holds, no retrieve is issued, and the
      count is zero; an empty-fixture regression takes the same path.
      **What is NOT closed, and remains a residual:** error-path-with-samples. If search returns 200 with
      hits and every `/addresses/{pid}` responds 404, the retrieve count clears the floor, validity passes,
      and the `retrieve is status 200` check drives `checks{phase:main}` under 0.95 — so k6 exits 99 and the
      run routes advisory-green while the retrieve p95 is measured over 404 latency. That is timing an error
      path, one leg over from the defect this ticket exists for. Narrow, and it is a real gap.
- [x] **Declare an `http_reqs` count threshold for BOTH legs. DONE 2026-08-19 — and the first version of
      this fix was broken in a way its own tests could not see.** k6 emits a tagged submetric into
      `--summary-export` only when a threshold NAMES it; an undeclared leg is not zero in the summary, it is
      absent. The first version declared a count threshold for `retrieve` only while `REQUIRED_LEGS` listed
      both, so `perf-validity.mjs` would have read `search` as zero and failed the nightly on EVERY run,
      healthy or not — and would have masked the one open task below, because the run would have reddened
      with "measured NOTHING on: search" and said nothing about whether retrieves worked.
      The six fixture tests could not catch it: their helper WROTE both metric keys, so they exercised the
      guard's logic against a shape k6 does not produce. **A guard whose fixtures synthesise their own input
      contract has not tested the contract.** Confirmed against `target/stress-v1-summary.json`, a real
      export, which carries only its two threshold-declared submetrics and no `http_reqs` submetric at all.
      `perf-validity-covers-declared-legs.test.mjs` now ties the two files together so they cannot drift.
- [x] **Fix the same defect in the stress profile. DONE 2026-08-19.** `test/k6/script.js` read
      `links.self.href` identically and would have thrown on every iteration against the current server.
      P032's Workaround and its open ADR-029 Phase 1 one-shot both depend on that profile. Both profiles now
      call the shared `retrieveUrlFor`, so they cannot diverge again.
- [x] **Pin the k6 version. DONE 2026-08-19.** `--summary-export` is long deprecated in favour of
      `handleSummary`, and `grafana/setup-k6-action@v1` installs latest, so the release that drops the flag
      would red the nightly unannounced. It fails closed rather than silently, but a pin makes the break a
      deliberate upgrade.
- [x] **Re-run and confirm `{phase:main,name:retrieve}` reports real samples. DONE 2026-08-19, run 32249606086.** `perf probe validity OK - search=298 retrieve=298`, with
      `{phase:main,name:retrieve} avg=2.86ms p(95)=6.47ms` where it had been zero samples and a tick.
      The whole chain is exercised end to end: k6 imported the shared module, `/addresses/{pid}` returned
      200s, the summary was exported and read, and the workflow routed on it. The k6 pin was verified by
      reading the INSTALLED version out of the Install step ("Downloading k6 version 0.49.0"), not the
      step's exit code - an action that ignored an unrecognised version string would also have exited 0.

- [x] **Recalibrate the count floor, which the first correct run showed was set ABOVE healthy throughput.
      DONE 2026-08-19.** The floor was `count>500`, chosen as "far below the ~21,000 a healthy window
      produces". That 21,000 was a SYMPTOM, not a baseline: the retrieve read threw before `sleep(1)`, and
      an uncaught exception aborts a k6 iteration, so iterations spun with no sleep at all. With the throw
      fixed, 5 VUs over 60 s produce ~298 per leg - so the floor breached on the first healthy run and
      would have emitted a spurious `::warning::` every night. Now `count>100`, which fires on a ~66%
      collapse. **The floor was calibrated against the defect it was written to catch**, and the comment
      warning against exactly this flap was written in the same commit. No unit test could have shown it;
      only a dispatched run did.

- [ ] **Re-dispatch and confirm a clean exit-0 run.** The run above proved the probe MEASURES; it did not
      prove a healthy run now passes every threshold, because the stale floor breached. Not closing this
      ticket until a run exits 0. Everything above is verified by unit tests over extracted pieces —
      `k6-retrieve-url.test.mjs` proves the URL is built from the field the API returns,
      `perf-validity.test.mjs` proves a zero-sample leg is rejected, and every guard was mutation-tested.
      None of that proves the probe now measures retrieves against a running instance: the unit tests would
      pass identically if k6 failed to import the module, or if `/addresses/{pid}` 404'd. Only a dispatched
      run settles it, and until one lands this ticket stays open.

## Dependencies

- **Blocks**: P032's exit criterion. Its "awaiting a clean validation run" was satisfied on 2026-08-19 in the narrow sense — the run completed — but the run proves the probe is half-blind, so a clean validation of the _signal_ has still not happened.
- **Blocked by**: (none)
- **Composes with**: P101 — the error lines were emitted and unread; detection and delivery are separate halves.

## Related

- **P032** ([`032-no-ci-perf-regression-detection.md`](../known-error/032-no-ci-perf-regression-detection.md)) — its recorded residual is precisely this: _"a probe that runs fine but measures the wrong thing … surfaces as a breach of `checks{phase:main}: rate>0.95`"_. Here it does not even surface that far, because the search checks pass and the retrieve check never runs.
- **P101** — why 24,537 error lines reached nobody.
- **P103** — the sibling detection gap in workflow referrers.
- **ADR-048** ([`048-moved-path-referrers-resolved-by-executable-guard.proposed.md`](../../decisions/048-moved-path-referrers-resolved-by-executable-guard.proposed.md)) — its criterion 5 requires guards to carry non-empty floors; this is the same requirement applied to a k6 threshold.
- **R023** (pipeline watchers report success on a red run) — the same class on a different surface. R023 is
  scoped by its H1 to the class rather than to the watcher script that triggered it, so this is a **fourth**
  instance of a risk the register already carries, not a new one. R023's residual note says its fixes are
  "not yet exercised in anger"; that is now partly answered, in the wrong direction.
- **JTBD-400** (Ship Releases Reliably From Trunk), persona `addressr-maintainer`.

Captured via `/wr-itil:capture-problem` after dispatching the perf workflow to verify the P032 referrer repoints. The repoints are confirmed working — the run reached k6 for the first time in a week — and reaching k6 is what exposed this.
