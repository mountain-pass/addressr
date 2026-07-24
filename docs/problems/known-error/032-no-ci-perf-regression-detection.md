# Problem 032: No CI perf regression detection — k6 stress profile is on-demand only

**Status**: Known Error
**Reported**: 2026-04-27
**Priority**: 9 (Medium) — Impact: Moderate (3) x Likelihood: Possible (3)

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
- [x] **Cadence decided** — `workflow_dispatch` + nightly `schedule:`, NOT per-push. Per-push gating would slow the trunk-based release loop (jtbd review confirmed). Advisory, not a release blocker. **Mechanism amended 2026-07-25**: the advisory signal is no longer "a failed nightly/dispatch run" — the k6 step now carries `continue-on-error: true`, so a breach surfaces as a `::warning::` plus a `$GITHUB_STEP_SUMMARY` entry on a **green** run. See "First-run breakage" below.
- [x] **Target decided** — local addressr + OpenSearch 3.5.0 in CI with the OT G-NAF fixture (the lower-cost starting point). Single production-engine target, not the 2.19/3.5 matrix (that matrix is for cross-version compat, not perf).
- [x] **Workflow placement decided** — SEPARATE workflow file (`.github/workflows/perf-regression.yml`), not the `release.yml` matrix. Decouples cadence, doesn't double matrix runtime. Architect confirmed this mirrors the existing `update-*.yml` cron pattern and does not conflict with ADR-001 (release gate).
- [x] **Authored** — `test/k6/regression.js` + `test:perf:regression` npm script. Existing 38-min `test/k6/script.js` stress profile retained for on-demand use.
- [ ] **Runner-noise variance — first cut committed, characterisation pending.** Thresholds are a deliberate first cut; tighten after a few real nightly baselines establish the runner's spread (do NOT tighten from quieter local-dev numbers). **Verification gate restated 2026-07-25**: job colour is no longer evidence — under `continue-on-error: true` the run is green by construction. The gate is now the *content* of the job summary: a nightly/dispatch run whose summary shows all three thresholds `✓` and a non-zero `http_reqs` with `checks_succeeded` at 100% → then Verifying → Closed. A run that is green but whose summary carries the `::warning::` is a FAILED verification.
- [ ] **ADR 029 Phase 1 step 6 one-shot** — running the stress profile once against the candidate AWS-managed domain pre-cutover to validate ADR 029's "Performance" driver. Independent of this CI probe; a one-shot manual run, left open.

## Fix Strategy

Traced by [RFC-007](../../rfcs/RFC-007-ci-perf-regression-probe.proposed.md) (CI perf-regression probe). Three artefacts, authored together as one atomic change (CI + test infra only, so no changeset per the workflow-only discipline — cf. RFC-002):

1. [`test/k6/regression.js`](../../test/k6/regression.js) — small deterministic regression profile (warm-up + 60 s / 5 VU measured window, conservative gating thresholds).
2. `test:perf:regression` npm script in [`package.json`](../../package.json) (sibling to `test:performance`; also the local pre-merge handle).
3. [`.github/workflows/perf-regression.yml`](../../.github/workflows/perf-regression.yml) — separate `workflow_dispatch` + nightly workflow: OpenSearch 3.5 service, OT fixture load, API server start, k6 run.

**Status**: fix authored, pushed, and exercised once — the first real nightly run FAILED and reddened master. Repaired 2026-07-25 (see below). Stays **Known Error**: the repair itself has not yet had a clean validation run.

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
2. `test/k6/regression.js` — added a `'search returns results'` check (`status === 200 && JSON.parse(body).length > 0`). Status alone could not prove the probe measured anything: an empty result set is a valid 200 *and is faster than a real search*, so a fixture or index-name regression would have made p95 look **better** while staying green.
3. `test/k6/regression.js` — removed `abortOnFail: true`. No threshold aborts now, so the full 75 s window always completes and yields the p95 series this ticket's open runner-variance task needs.
4. `.github/workflows/perf-regression.yml` — the k6 step is now `continue-on-error: true` (with `id: k6` and `shell: bash` for `-eo pipefail`, without which the `| tee` would mask k6's exit code and make `steps.k6.outcome` permanently `success`). A threshold breach, or any other nonzero k6 exit, can no longer fail this workflow.
5. `.github/workflows/perf-regression.yml` — new `if: always()` reporting step writes the k6 THRESHOLDS / TOTAL RESULTS block to `$GITHUB_STEP_SUMMARY` and emits `::warning::` when the probe did not pass, so the result stays visible.

**Verified locally** (the 38-min stress profile was NOT run): YAML parses; the k6 script babel-parses and passes `k6 inspect`; and a duration-shortened copy of the fixed probe run against a stub gives all three checks ✓, `http_req_failed: 0.00%`, all three thresholds ✓, with the stub receiving properly-encoded `?q=GAZE%20RD%20CHRISTMAS%20ISLAND`.

### Outstanding questions from this repair

Both the architect and JTBD reviews independently objected to the blanket `continue-on-error: true` and recommended discriminating k6's exit code (tolerate 99 = threshold breach; still fail on any other nonzero = broken probe). The user pinned the blanket form deliberately. Recorded, not re-litigated:

- **A broken probe now reports green.** This exact incident was a probe-validity failure, not a perf regression; under the new posture an identical future breakage would not redden anything. Item 2 above (the results check) is the partial mitigation — it converts a silent pass into a `::warning::` — but the warning is pull-based.
- **No push notification.** GitHub notifies on *failed* scheduled runs; it does not notify on `::warning::` or step summaries. On a nightly cron nobody watches by hand, advisory-loud has become advisory-pull-only. A follow-on channel (e.g. open/update an issue when `steps.k6.outcome != 'success'`) is the natural remedy.
- **RFC-007 line 33** still asserts "k6 exits non-zero on a breach, failing the job", which this change falsifies — deferred, out of this iteration's committed scope.
- **`screens:` backfill** — `.github/workflows/perf-regression.yml` is not in JTBD-400's `screens:` list, nor `test/k6/regression.js` in JTBD-001's. Forward `@jtbd` annotations are correct; only the reverse index is missing.

**Follow-on (architect, non-blocking)**: record a proposed ADR capturing the standing perf-regression methodology (seeded probe / separate nightly cadence / conservative-threshold philosophy). Direction pinned same-turn per ADR-064, so no user question needed; deferred from this AFK iter because `capture-*` skills are out of scope for the iter.

## RFCs

- [RFC-007](../../rfcs/RFC-007-ci-perf-regression-probe.proposed.md) — CI perf-regression probe. Proposed. The fix vehicle for this problem (I13 fix-time trace).

## Related

- [`package.json`](../../package.json) — `test:performance` script at line 136.
- [`test/k6/script.js`](../../test/k6/script.js) — the existing 38-min stress profile.
- [`.github/workflows/release.yml`](../../.github/workflows/release.yml) — `build-and-test` job; would either grow a perf step or sit alongside a sibling workflow.
- [ADR 029 — Two-phase blue/green upgrade off OpenSearch 1.3.20](../decisions/029-opensearch-blue-green-two-phase-upgrade.proposed.md) — line 21 cites "Performance" as a Decision Driver. P032 is the operational follow-on for catching perf changes during and after Phase 1.
- [ADR 025 — Search ranking symmetric SSLA](../decisions/025-search-ranking-symmetric-ssla.accepted.md) — covers correctness of ranking; perf coverage is the missing axis.
- [Problem P028 — OpenSearch 1.3.20 version debt](./028-opensearch-1-3-20-version-debt.known-error.md) — engine bump that motivates closing this gap; P028 can land Phase 1 cutover without P032 resolved (production monitoring is the fallback control), but P032 is the right follow-on for institutionalising perf gating.
- [Problem P024 — Architect agent misses performance implications](./024-architect-agent-misses-performance-implications.parked.md) — adjacent (governance tooling for perf review) but distinct (P032 is automated regression detection in CI; P024 is upfront perf reasoning by the architect agent).
