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
- [x] **Cadence decided** — `workflow_dispatch` + nightly `schedule:`, NOT per-push. Per-push gating would slow the trunk-based release loop (jtbd review confirmed). Advisory-loud (a failed nightly/dispatch run), not a release blocker.
- [x] **Target decided** — local addressr + OpenSearch 3.5.0 in CI with the OT G-NAF fixture (the lower-cost starting point). Single production-engine target, not the 2.19/3.5 matrix (that matrix is for cross-version compat, not perf).
- [x] **Workflow placement decided** — SEPARATE workflow file (`.github/workflows/perf-regression.yml`), not the `release.yml` matrix. Decouples cadence, doesn't double matrix runtime. Architect confirmed this mirrors the existing `update-*.yml` cron pattern and does not conflict with ADR-001 (release gate).
- [x] **Authored** — `test/k6/regression.js` + `test:perf:regression` npm script. Existing 38-min `test/k6/script.js` stress profile retained for on-demand use.
- [ ] **Runner-noise variance — first cut committed, characterisation pending.** Thresholds are a deliberate first cut; tighten after a few real nightly baselines establish the runner's spread (do NOT tighten from quieter local-dev numbers). This is P032's verification gate: first green nightly/dispatch run confirms the thresholds don't flap → then Verifying → Closed.
- [ ] **ADR 029 Phase 1 step 6 one-shot** — running the stress profile once against the candidate AWS-managed domain pre-cutover to validate ADR 029's "Performance" driver. Independent of this CI probe; a one-shot manual run, left open.

## Fix Strategy

Traced by [RFC-007](../../rfcs/RFC-007-ci-perf-regression-probe.proposed.md) (CI perf-regression probe). Three artefacts, authored together as one atomic change (CI + test infra only, so no changeset per the workflow-only discipline — cf. RFC-002):

1. [`test/k6/regression.js`](../../test/k6/regression.js) — small deterministic regression profile (warm-up + 60 s / 5 VU measured window, conservative gating thresholds).
2. `test:perf:regression` npm script in [`package.json`](../../package.json) (sibling to `test:performance`; also the local pre-merge handle).
3. [`.github/workflows/perf-regression.yml`](../../.github/workflows/perf-regression.yml) — separate `workflow_dispatch` + nightly workflow: OpenSearch 3.5 service, OT fixture load, API server start, k6 run.

**Status**: fix authored + committed locally, **not yet pushed or exercised**. Transitioned to Known Error (root cause = capability gap documented, workaround = manual stress run documented, fix vehicle RFC-007 exists). Remaining before Verifying: push, then the first nightly/dispatch run validates that the thresholds survive real runner variance without flapping.

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
