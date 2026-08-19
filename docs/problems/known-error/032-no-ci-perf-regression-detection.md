# Problem 032: No CI perf regression detection — k6 stress profile is on-demand only

**Status**: Known Error
**Reported**: 2026-04-27
**Priority**: 9 (Medium) — Impact: Moderate (3) x Likelihood: Possible (3)
**Origin**: internal
**Effort**: M — CI workflow + validation test wiring (k6 exit-code discrimination shipped; clean validation run landed 2026-08-19, run 32250954868)

> **2026-08-18 — that exit criterion has been UNREACHABLE since 2026-08-12.** "Awaiting a clean validation run" could not arrive: `perf-regression.yml`'s `Generate version file` step ran `npm run genversion`, a script that moved into the `@mountainpass/addressr` workspace with the ADR-046 restructure and no longer resolves at the root. The job died at that step on **every** scheduled run from 2026-08-12 to 2026-08-17 inclusive — six consecutive nights — so no run reached k6 at all. Repointed to `-w @mountainpass/addressr` this date, along with a second unrepointed referrer in the same file (`import('./service/address-service.js')` -> `./packages/addressr/service/address-service.js`, whose twin at `release.yml:151` had been repointed at the time; this one was cache-masked by the G-NAF `-f` guard). The clock on a clean validation run starts from the first green scheduled run after this date, not from the ticket's original estimate.
>
> **2026-08-19 — the first run to reach k6 completed, and it disproved half the probe.** Dispatched manually on `f7936ae6` to verify the repoints; run `32203592902` went green. The repoints work: `Generate version file` and `Prepare OT test fixture` both passed for the first time since 2026-08-12. But reaching k6 is what exposed **P104** — `test/k6/regression.js:119` throws `TypeError: Cannot read property 'self' of undefined` on **every** iteration (21,860 in the measured phase), so the `retrieve` request is never issued and its `p(95)<1000` threshold passes on an empty sample set, printing `✓ p(95)=0s`. This ticket's own recorded residual — _a probe that runs fine but measures the wrong thing_ — is now evidenced rather than predicted. The exit criterion is satisfied for the HARNESS and unsatisfied for the SIGNAL.
> **WSJF**: 9.0 — (9 × 2.0) / 2 — backfilled 2026-07-29 (review)
>
> **2026-08-20 — THE PROBE IS DELETED. The gap this ticket names is now unmitigated by choice, and the
> reason is not the one this ticket spent four months on.** User-directed after being briefed that the probe
> measures a rented GitHub runner rather than production, blocks nothing, and had failed six consecutive
> nights while emailing them each time. Asked whether it should alert at all — options were keep-but-silence,
> alert-only-if-persistently-broken, make-it-measure-production-first, or delete — the answer was _"Delete
> it"_. Immediately before that they asked _"what do you want me to do about them? What is the nightly job
> anyway?"_, which is the finding in one line: the instrument's only consumer did not recognise it.
>
> **The governing rule they then stated, which is wider than this ticket:** _"I don't care so much how we
> check it, I care more about how you monitor it. I'm not going to monitor it."_ So the axis is not
> runner-versus-production and never was. A check whose only consumer is the maintainer's attention is not a
> control, however it is measured and however it is delivered. That retires this ticket's own
> `screens:`-backfill item and its graduation condition (_"a breach becomes actionable-on-arrival and needs
> its own channel"_) — a new channel aimed at the same reader reproduces the defect. Recorded as an ADR
> because it governs the other ten scheduled workflows too, not just this one.
>
> **What was actually removed, stated precisely so this does not read as removing protection.** The probe
> never gated at JTBD-001's 200 ms outcome; it gated at `search p95 < 1500 ms` and `retrieve p95 < 1000 ms`,
> 7.5× and 5× that figure, advisory-only, on a job that stayed green through a breach. Its retrieve leg
> measured **zero** requests for its entire life (P104) while printing `✓ p(95)=0s`. Exactly one run in the
> whole record reached k6 and passed (`32203592902`, 2026-08-19). So it never gated at the job's figure,
> never measured one of its two legs, and had no reader.
>
> **What remains, corrected twice in one session — read the second correction, not the first.** The first
> correction said production monitoring is the only remaining control. The second said there is no automated
> latency control anywhere, reasoning from `apps/addressr-deployment/main.tf`, where the only two
> `aws_cloudwatch_metric_alarm` resources watch `SearchableDocuments` and `SearchLatency` p95 appears solely
> as a dashboard widget in `locals.search_parity_widgets`. That is accurate about AWS and **wrong about the
> system.** The maintainer supplied the missing half: **the API gateway measures end-to-end latency
> continuously, across every consumer and region, and carries its own alerting surface.** It is a better
> measurement than the deleted probe ever produced — real traffic, real clients — and it predates this whole
> ticket.
>
> **The lesson is the one this ticket keeps relearning: a figure derived from the repo is not a figure about
> the system.** This repo is one component behind a marketplace gateway and a CDN. Twice in one session an
> absence was asserted from the absence of a file. The remaining gap is therefore not measurement but a
> **terminus** — whether an alert exists on that signal, and whether it lands somewhere that acts or that an
> agent reads rather than in an inbox. Unknown rather than absent; it must be settled by looking. Captured
> separately.
>
> **No gateway figures are recorded here.** This repo is public, and traffic volumes and consumer counts are
> confidential (R004 names exactly this). The shape is recorded; the values are not.
>
> **Not retained as a standing workaround: "run `npm run test:performance` before risky changes."** That is
> the same defect in different clothes — it depends on the maintainer remembering, which is what the rule
> above rules out. `test/k6/script.js` and `test:performance` survive for a different reason: ADR-031's
> soak-gate criterion 5 needs a k6 baseline immediately before a cutover, and after this deletion that
> profile is the only one left. Cost worth recording for whoever runs that gate next: `regression.js` was the
> better-shaped instrument for _"freshly measured, immediately before cutover"_ — deterministic, 75 s,
> comparable run-to-run — and the surviving profile is a 38-minute `Math.random` ramp.

## Description

`package.json:136` defines `test:performance` (`k6 run --out csv=target/stress.csv test/k6/script.js`) but no automated workflow runs it. CI's `build-and-test` job (`.github/workflows/release.yml`) covers correctness via `test:nogeo` + `test:geo` (cucumber on both 1.3.20 and 2.19.5 matrix legs after commit `d3d1e09`), but performance regressions on the search/retrieve path can land in production undetected.

The existing `test/k6/script.js` is a 38-minute stress profile (multi-stage ramp to 20 concurrent users, p95 thresholds at 16 seconds, "find the breaking point" shape). It is not push-friendly and would dominate CI cost if added to every push verbatim. What's missing is a smaller, regression-detection-shaped probe — fixed seed, short duration, tight thresholds — that runs on a sensible cadence (per-PR or nightly).

This problem is independent of P028 (the OpenSearch engine bump) but P028 amplifies it: ADR 029 line 21 lists "Performance" as a Decision Driver ("OpenSearch 2.x has repeatedly improved indexing throughput, aggregation performance, and memory/heap behaviour") and the cutover/soak path (steps 7–9) currently has no automated way to validate that claim or catch a perf regression introduced during the parallel-domain window.

## Symptoms

- `test:performance` runs only when a maintainer explicitly invokes it locally; no CI job calls it.
- Ranking/scoring changes (ADRs 025–028) ship with cucumber correctness coverage but no perf coverage.
- ADR 029 Phase 1 has no perf gate — the cutover (step 7) and soak (step 9) rely on production monitoring to detect a perf regression rather than catching it pre-cutover.
- The OpenSearch 2.x upgrade itself (P028) cannot be perf-validated against 1.3.20 in CI: the matrix tests correctness only.

## Workaround

**Run `npm run test:performance` manually** before significant releases. Specifically: a maintainer should run the existing 38-min stress profile against a representative target (local addressr+OpenSearch with a non-trivial dataset, or staging) when shipping ranking changes, search-path refactors, or engine version bumps. Recording the CSV output (`target/stress.csv`) under `.risk-reports/` would let manual baselines be compared.

This is operationally honest but easy to forget — exactly why a CI gate would be more valuable than the current ad-hoc posture.

## Impact Assessment

- **Who is affected**: Web/App Developer (JTBD-001 — Search and Autocomplete) is the **primary** job served: its desired outcome "results appear within 200 ms of input" is exactly what a p95 regression gate defends (corrected from the original framing per the 2026-07-24 jtbd review — this is a directly-served documented outcome, not merely indirect). Addressr Maintainer (JTBD-400 — Ship Releases Reliably From Trunk) is the persona/CI vehicle that runs the probe. AI Assistant User participates as a secondary persona on JTBD-001/JTBD-002. Adjacent-but-distinct: JTBD-201 (Validate a New Search Backend Before Cutover) owns the cutover-warming use of k6 — related, not the served job.
- **Frequency**: Continuous risk surface — every commit can theoretically introduce a perf regression. Materialises rarely (most commits don't touch hot paths) but undetected regressions accumulate over time.
- **Severity**: Moderate (3) — a perf regression on the search/retrieve path is an SLA risk for the RapidAPI-listed service but is not data loss or a correctness break; production monitoring would eventually catch it. Likelihood Possible (3) — perf regressions are a known class of issue, especially with engine-family changes (P028) or scoring/analyzer changes (ADRs 026–028).
- **Analytics**: N/A — perf data is not captured systematically today; introducing a probe is a prerequisite for analytics here.

## Root Cause Analysis

### Why we don't have it

- The existing `test/k6/script.js` was written as a stress test ("find the breaking point"), not as a regression detector. Its 38-min duration and 20-user ramp are wrong shape for per-push CI.
- No CI workflow has ever invoked it; no tracking ticket existed before this one.
- A separate "small smoke" profile would need to be authored alongside any CI integration.

### Investigation Tasks

- [x] **Shape decided** — fixed deterministic query sequence (no `Math.random`), 15 s warm-up + 60 s at 5 constant VUs, both search + retrieve paths. Thresholds set **conservatively** (search p95 < 1500 ms, retrieve p95 < 1000 ms, checks rate > 0.95) rather than the 500 ms first-guess, to survive GitHub-hosted-runner variance. See `test/k6/regression.js`.
- [x] **Cadence decided** — `workflow_dispatch` + nightly `schedule:`, NOT per-push. Per-push gating would slow the trunk-based release loop (jtbd review confirmed). Advisory, not a release blocker. **Mechanism amended 2026-07-25**: the advisory signal is no longer "a failed nightly/dispatch run" — the k6 step carried `continue-on-error: true`, so a breach surfaced as a `::warning::` plus a `$GITHUB_STEP_SUMMARY` entry on a **green** run. See "First-run breakage" below. **Amended again 2026-07-26**: the blanket tolerance is replaced by exit-code discrimination — a perf breach (k6 exit 99) stays advisory-on-green, but any other nonzero exit fails the job. See "Posture change" below.
- [x] **Target decided** — local addressr + OpenSearch 3.5.0 in CI with the OT G-NAF fixture (the lower-cost starting point). Single production-engine target, not the 2.19/3.5 matrix (that matrix is for cross-version compat, not perf).
- [x] **Workflow placement decided** — SEPARATE workflow file (`.github/workflows/perf-regression.yml`), not the `release.yml` matrix. Decouples cadence, doesn't double matrix runtime. Architect confirmed this mirrors the existing `update-*.yml` cron pattern and does not conflict with ADR-001 (release gate).
- [x] **Authored** — `test/k6/regression.js` + `test:perf:regression` npm script. Existing 38-min `test/k6/script.js` stress profile retained for on-demand use.
- [x] **Runner-noise variance measured locally 2026-08-03 — and it is far wider than the thresholds imply.** Ten runs of `test/k6/regression.js` against a real OpenSearch 3.5.0 container with the OT fixture (5,186 docs), on one machine, alternating between two express versions so drift hit both equally. Search p95 per run:

  ```
  express 4:  57.5  21.3  55.9  37.2  19.1   (median 37.2, spread 201%)
  express 5:  37.8  18.7  47.7  41.6  15.9   (median 37.8, spread 200%)
  ```

  **The within-version spread is 3x, on a quiet local machine with nothing else running.** That is the number this task was asking for, and it has two consequences.

  First, it sets a floor on what this harness can detect. The between-version median difference was 1.8% — undetectable, and rightly reported as no difference. Anything smaller than roughly 2x is not resolvable at 5 VUs over 60 s, so tightening the thresholds toward the observed median (~37 ms) would flap constantly. The current `p95 < 1500 ms` is ~40x the median, which is loose but is defensible against this spread: it catches a gross regression and nothing subtler. Do not tighten without either raising the VU count and duration, or switching to a paired/alternating comparison against a baseline rather than an absolute threshold.

  Second, it is a caution about method, learned the expensive way. The first two runs — one of each version, taken in sequence — showed express 5 ahead by 34% at p95 and 54% on throughput. That was entirely an artefact of cache warming, and it reversed to nothing once the runs alternated. **A single A/B pair from this harness is not evidence of anything.** Whatever replaces the absolute thresholds needs enough alternating samples to see past a 3x spread.

  The local numbers are quieter than a hosted runner by construction, so treat 3x as the optimistic bound, not the expected one.

- [ ] **Threshold tightening still pending**, now with the spread characterised above rather than unknown. Thresholds are a deliberate first cut; tighten after a few real nightly baselines establish the runner's spread (do NOT tighten from quieter local-dev numbers). **Verification gate restated 2026-07-26** (supersedes the 2026-07-25 restatement, which said job colour could never be evidence — that was true only under the blanket `continue-on-error`): job colour is now evidence for the _harness_ class only. A **red** run means k6 failed to run at all and is an outright failed verification. A **green** run is necessary but not sufficient, because a perf breach and a wrong-measurement breach both exit 99 and stay green. The gate is therefore still the _content_ of the job summary: a nightly/dispatch run whose summary shows k6 exit code `0`, all three thresholds `✓`, and a non-zero `http_reqs` with `checks_succeeded` at 100% → then Verifying → Closed. A green run whose summary carries the `::warning::` is a FAILED verification.
- [ ] **ADR 029 Phase 1 step 6 one-shot** — running the stress profile once against the candidate AWS-managed domain pre-cutover to validate ADR 029's "Performance" driver. Independent of this CI probe; a one-shot manual run, left open.

## Fix Strategy

Traced by [RFC-007](../../rfcs/RFC-007-ci-perf-regression-probe.proposed.md) (CI perf-regression probe). Three artefacts, authored together as one atomic change (CI + test infra only, so no changeset per the workflow-only discipline — cf. RFC-002):

**All three artefacts below were DELETED on 2026-08-20 — see the retirement note at the top of this ticket.
The paths are retained as plain text rather than links because the files no longer exist.**

1. `test/k6/regression.js` — small deterministic regression profile (warm-up + 60 s / 5 VU measured window, conservative gating thresholds).
2. `test:perf:regression` npm script in [`package.json`](../../../package.json) (sibling to `test:performance`; also the local pre-merge handle).
3. `.github/workflows/perf-regression.yml` — separate `workflow_dispatch` + nightly workflow: OpenSearch 3.5 service, OT fixture load, API server start, k6 run.

**Status**: fix authored, pushed, and exercised once — the first real nightly run FAILED and reddened master. Repaired 2026-07-25 (see below). Stays **Known Error**: the probe now validates (run 32250954868, 2026-08-19), but the two items carried from P104 below are open.

### First-run breakage (2026-07-25) — the shipped probe measured an error path

The first nightly run ([30103898200](https://github.com/mountain-pass/addressr/actions/runs/30103898200)) failed and reddened master, blocking the release pipeline.

**What did NOT fail** (recorded because the initial read of the log misattributed the cause): the G-NAF OT fixture prep worked, the loader indexed **5186 OT address rows** into OpenSearch 3.5.0, and the server came up healthy on `:6060` after 2 attempts. The `Error: ENOENT ... 'target/gnaf-fixture/Counts.csv'` line in the log is a **benign** `fileExists()` debug log — `loadGnafData()` (`service/address-service.js:1332-1344`) explicitly handles a missing `Counts.csv` (the may21+ G-NAF layout has none) and falls through to directory scanning. It is not an error condition.

**Actual root cause**: `test/k6/regression.js` built its search URL with k6's `http.url` tagged template — `` http.url`${BASE_URL}/addresses?q=${query}` ``. **k6's `http.url` does not percent-encode interpolated values.** Every query in the fixed sequence contains a space (`CHRISTMAS ISLAND`, `MURRAY RD`, …), so a raw space went into the HTTP request line and Node's server rejected it with a bare 47-byte `HTTP/1.1 400 Bad Request`. The probe was timing an error path, not the search path.

Confirmed two ways locally:

- A raw-space request line against a Node `http` server returns exactly `HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n` — **47 bytes**. 35 requests × 47 B = the **1.6 kB `data_received`** the failed run reported. Exact match.
- Running the real k6 binary against a stub: `` http.url`…?q=${'CHRISTMAS ISLAND'}` `` → **status 400**; `encodeURIComponent(query)` → **status 200**, server sees `?q=CHRISTMAS%20ISLAND`.

That gave `checks_succeeded: 0.00%` / `http_req_failed: 100%`, which breached `checks{phase:main}: rate>0.95`. That threshold carried `abortOnFail: true`, so k6 aborted 1 s into the measured window and exited **99** → job failed → workflow failed → master red.

**Fix applied** (CI + test infra only, no `src/` runtime change, so no changeset per the workflow-only discipline):

1. `test/k6/regression.js` — `encodeURIComponent(query)` with a plain template literal (the explicit `name: 'search'` tag already does the URL grouping `http.url` existed for). **This is the real defect fix.**
2. `test/k6/regression.js` — added a `'search returns results'` check (`status === 200 && JSON.parse(body).length > 0`). Status alone could not prove the probe measured anything: an empty result set is a valid 200 _and is faster than a real search_, so a fixture or index-name regression would have made p95 look **better** while staying green.
3. `test/k6/regression.js` — removed `abortOnFail: true`. No threshold aborts now, so the full 75 s window always completes and yields the p95 series this ticket's open runner-variance task needs.
4. `.github/workflows/perf-regression.yml` — the k6 step was given a blanket `continue-on-error: true`, so a threshold breach, or any other nonzero k6 exit, could no longer fail this workflow. **Superseded 2026-07-26** — see "Posture change" below.
5. `.github/workflows/perf-regression.yml` — new `if: always()` reporting step writes the k6 THRESHOLDS / TOTAL RESULTS block to `$GITHUB_STEP_SUMMARY` and emits `::warning::` when the probe did not pass, so the result stays visible. Retained, but re-keyed in the 2026-07-26 change.

**Verified locally** (the 38-min stress profile was NOT run): YAML parses; the k6 script babel-parses and passes `k6 inspect`; and a duration-shortened copy of the fixed probe run against a stub gives all three checks ✓, `http_req_failed: 0.00%`, all three thresholds ✓, with the stub receiving properly-encoded `?q=GAZE%20RD%20CHRISTMAS%20ISLAND`.

### Posture change (2026-07-26) — blanket tolerance replaced by exit-code discrimination

The 2026-07-25 repair left the k6 step with a **blanket** `continue-on-error: true`, which made the job incapable of failing for any reason — including the probe being broken, which is precisely what the incident was. Both the architect and JTBD reviews objected to the blanket form at the time and recommended discriminating on k6's exit code; the user accepted that recommendation and directed the change.

**Shipped shape.** `continue-on-error` is gone. The k6 run is wrapped in bash and routed on its exit code:

| k6 exit           | Meaning                    | Job outcome                                                           |
| ----------------- | -------------------------- | --------------------------------------------------------------------- |
| `0`               | every threshold passed     | succeeds                                                              |
| `99`              | a k6 threshold was crossed | **advisory** — `::warning::` + job-summary entry, job stays **green** |
| any other nonzero | k6 itself failed to run    | **fails loudly** — `::error::` + `exit 1`                             |

The advisory arm preserves the original P032 intent: a perf breach must never redden master or stall the trunk release loop. The loud arm closes the hole the blanket form opened.

Mechanics worth not "tidying" away (each was got wrong at least once during authoring):

- `shell: bash` is retained, but for `PIPESTATUS` (arrays do not exist in `dash`), **not** for `-eo pipefail` as the 2026-07-25 note claimed.
- `set +e` around the pipeline is mandatory. GitHub invokes `shell: bash` as `bash --noprofile --norc -eo pipefail`, so without it the pipeline's 99 aborts the script before `rc` is ever read — inverting the intent into "any breach fails the job".
- `k6_exit` is written to `$GITHUB_OUTPUT` **before** the failing `exit 1`, so the `if: always()` reporting step still renders diagnostics on the loud path.
- The reporting step is re-keyed from the step result to `steps.k6.outputs.k6_exit`. Under discrimination the step result is `success` for both a clean run and an advisory breach, so it can no longer carry the signal.
- In the reporting step, `summary=$(sed … || true)` — an assignment from a command substitution propagates its exit status, so a missing log (sed exits 2) would kill the step under errexit, on exactly the cancelled/early-failure runs where `if: always()` put us there.

All three branches were exercised locally against a stub under GitHub's exact shell invocation, plus the reporting step's log-present / no-match / log-missing cases. `test/js/__tests__/perf-regression-workflow.test.mjs` pins the shape so a later "simplify the wrapper" cannot silently restore blanket tolerance.

### Residuals after the posture change

- ****Partly closed 2026-08-19** — the ZERO-SAMPLE subclass is closed by `scripts/perf-validity.mjs`, which
  reads the exported summary and routes a leg that measured nothing to a loud failure rather than an advisory
  warning (see P104). The error-path-with-samples subclass — retrieves that all 404, clearing the count floor
  while the checks rate breaches and the run stays advisory-green — is still open. The wrong-measurement class
  is therefore NOT fully closed** — this is the sharp one. A probe that runs fine but measures the wrong thing (the 2026-07-25 unencoded-URL bug; an empty result set from a fixture or index-name regression; the server dying mid-run) surfaces as a breach of `checks{phase:main}: rate>0.95`, and k6 emits **the same exit 99** for that as for a genuine p95 regression. So a rerun of the incident that motivated all of this would land in the **advisory** branch and report green. Only the harness class (k6 binary missing, script would not parse, panic/OOM, log write failed) actually moved from silent-green to loud. Remedy, in ascending cost: (a) grep the already-tee'd `target/perf-regression.log` in the existing reporting step for `http_reqs` zero / `http_req_failed` at 100% / `checks_succeeded` at 0% and route those to `::error::` + `exit 1`; (b) add `handleSummary` to `test/k6/regression.js` to emit `target/perf-summary.json` and route on its content, which is the better long-term shape. Neither was built here: the user's direction was exit-code discrimination specifically, and widening it autonomously was declined.
- **Accounting correction.** "Server down" should not be credited to the closed set: server-never-came-up already fails today at the health-wait step (`perf-regression.yml`, no `continue-on-error`). Only server-dies-_mid-run_ is new, and it routes advisory.
- **Notification split.** GitHub notifies on _failed_ scheduled runs, not on `::warning::` or step summaries. Under the new shape a broken probe fails and therefore notifies; a perf breach stays pull-only. That ordering is defensible while the thresholds are uncalibrated — a broken probe invalidates all subsequent signal and compounds nightly, whereas one threshold crossing is a single point in a series read in aggregate. **Graduation condition**: once enough nightly baselines characterise the runner spread and the thresholds are tightened toward JTBD-001's 200 ms outcome, a breach becomes actionable-on-arrival and needs its own channel (open/update an issue when `steps.k6.outputs.k6_exit == 99`).
- **`screens:` backfill — STRUCK 2026-08-20, do not action.** It named `.github/workflows/perf-regression.yml`, `test/k6/regression.js`, and `test/js/__tests__/perf-regression-workflow.test.mjs`, all three of which were deleted this date. Actioning it would add `screens:` entries for files that do not exist. The fourth file it named, `test/js/__tests__/release-workflow-deploy-only.test.mjs`, IS now covered: JTBD-400 gained an annotation-keyed test entry on 2026-08-20, and membership is by `@jtbd` marker rather than by path, so that file joined the set by carrying the marker and the deleted one left it by ceasing to exist. The item is discharged by the combination, not abandoned.

**Follow-on (architect, non-blocking)**: record a proposed ADR capturing the standing perf-regression methodology (seeded probe / separate nightly cadence / conservative-threshold philosophy), and fold in the exit-code discrimination rule **and** the wrong-measurement residual as part of that methodology. Direction pinned same-turn per ADR-064, so no user question needed; deferred from the AFK iters because `capture-*` skills are out of iter scope.

## RFCs

- [RFC-007](../../rfcs/RFC-007-ci-perf-regression-probe.proposed.md) — CI perf-regression probe. Proposed. The fix vehicle for this problem (I13 fix-time trace).

## Carried from P104 on its close, 2026-08-19

P104 (the retrieve leg measuring nothing and reporting a tick) is **closed**, verified against dispatched
run 32250954868: every threshold ticked, zero crossings, and the retrieve leg measuring 296 requests at
avg=3.33ms p(95)=6.95ms where it had issued zero.
Two items outlive P104 and belong here, because this ticket owns the probe's residuals.

- [ ] **Close the error-path-with-samples subclass.** The validity check now catches a leg that measured
      NOTHING. It does not catch a leg that measured only errors: search 200s with hits while every
      `/addresses/{pid}` 404s clears the count floor, passes validity, drives `checks{phase:main}` under
      0.95, and routes advisory-green with p95 measured over error latency. That is timing an error path,
      one leg over from the defect P104 fixed.
- [ ] **Pin the count floor against attainable throughput.** Nothing asserts the floor's VALUE - only that
      the threshold key exists - which is how a floor of 500 shipped green and then breached on the first
      healthy run, having been derived from a request count the defect itself inflated. Derive the pin
      from the scenario arithmetic (5 VUs x 60 s with `sleep(1)` gives a ceiling near 300), NOT from an
      observation: a pin calibrated from one run repeats P104's mistake one level up. Two clean runs at
      296 and 298 support the assumption that the sleep dominates request time.

## Related

- [`package.json`](../../../package.json) — `test:performance` script at line 136.
- [`test/k6/script.js`](../../../test/k6/script.js) — the existing 38-min stress profile.
- [`.github/workflows/release.yml`](../../../.github/workflows/release.yml) — `build-and-test` job; would either grow a perf step or sit alongside a sibling workflow.
- [ADR 029 — Two-phase blue/green upgrade off OpenSearch 1.3.20](../../decisions/029-opensearch-blue-green-two-phase-upgrade.accepted.md) — line 21 cites "Performance" as a Decision Driver. P032 is the operational follow-on for catching perf changes during and after Phase 1.
- [ADR 025 — Search ranking symmetric SSLA](../../decisions/025-search-ranking-symmetric-ssla.accepted.md) — covers correctness of ranking; perf coverage is the missing axis.
- [Problem P028 — OpenSearch 1.3.20 version debt](../closed/028-opensearch-1-3-20-version-debt.md) — engine bump that motivates closing this gap; P028 can land Phase 1 cutover without P032 resolved (production monitoring is the fallback control), but P032 is the right follow-on for institutionalising perf gating.
- [Problem P024 — Architect agent misses performance implications](../parked/024-architect-agent-misses-performance-implications.md) — adjacent (governance tooling for perf review) but distinct (P032 is automated regression detection in CI; P024 is upfront perf reasoning by the architect agent).
