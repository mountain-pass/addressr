# Problem 032: No CI perf regression detection — k6 stress profile is on-demand only

**Status**: Open
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

- **Who is affected**: Addressr Contributor/Maintainer (J7 — Ship releases reliably from trunk) directly. Indirectly, Web/App Developer (J1 — search/autocomplete) and AI Assistant User (J2) via undetected p95 latency regressions affecting their own SLA commitments.
- **Frequency**: Continuous risk surface — every commit can theoretically introduce a perf regression. Materialises rarely (most commits don't touch hot paths) but undetected regressions accumulate over time.
- **Severity**: Moderate (3) — a perf regression on the search/retrieve path is an SLA risk for the RapidAPI-listed service but is not data loss or a correctness break; production monitoring would eventually catch it. Likelihood Possible (3) — perf regressions are a known class of issue, especially with engine-family changes (P028) or scoring/analyzer changes (ADRs 026–028).
- **Analytics**: N/A — perf data is not captured systematically today; introducing a probe is a prerequisite for analytics here.

## Root Cause Analysis

### Why we don't have it

- The existing `test/k6/script.js` was written as a stress test ("find the breaking point"), not as a regression detector. Its 38-min duration and 20-user ramp are wrong shape for per-push CI.
- No CI workflow has ever invoked it; no tracking ticket existed before this one.
- A separate "small smoke" profile would need to be authored alongside any CI integration.

### Investigation Tasks

- [ ] Decide the right shape for a regression detector: fixed seed, ~60 seconds, 5 concurrent users, tight p95 thresholds (e.g. p95 < 500 ms for `/addresses?q=…` against the OT fixture). Document the chosen shape.
- [ ] Decide the right cadence: per-push (gate the release), per-PR comment (advisory), nightly (`schedule:`), or `workflow_dispatch` only.
- [ ] Decide the right target: local addressr + OpenSearch in CI (cheap but small dataset), or a hosted staging environment (realistic but ops-heavy). Local + OT fixture is the lower-cost starting point.
- [ ] Decide whether to add to the existing `release.yml` matrix (every leg gates on perf) or a separate workflow file (decoupled cadence, doesn't double the matrix runtime). Strong lean toward separate.
- [ ] Author a smaller `test/k6/regression.js` (or equivalent) and a corresponding `test:perf:regression` npm script. Keep the existing 38-min stress script for on-demand use.
- [ ] If hosted on GitHub-hosted runners: characterise runner-noise variance; pick thresholds that survive routine variance without flapping. May need warm-up runs and percentile sampling.
- [ ] Tie a perf gate into ADR 029 Phase 1 step 6 (validate against `search-addressr4-…` AWS-managed v2 domain) — running the stress profile once against the new domain pre-cutover would directly validate ADR 029's "Performance" Decision Driver. Independent of the per-push CI question; this is a one-shot manual run.

## Related

- [`package.json`](../../package.json) — `test:performance` script at line 136.
- [`test/k6/script.js`](../../test/k6/script.js) — the existing 38-min stress profile.
- [`.github/workflows/release.yml`](../../.github/workflows/release.yml) — `build-and-test` job; would either grow a perf step or sit alongside a sibling workflow.
- [ADR 029 — Two-phase blue/green upgrade off OpenSearch 1.3.20](../decisions/029-opensearch-blue-green-two-phase-upgrade.proposed.md) — line 21 cites "Performance" as a Decision Driver. P032 is the operational follow-on for catching perf changes during and after Phase 1.
- [ADR 025 — Search ranking symmetric SSLA](../decisions/025-search-ranking-symmetric-ssla.accepted.md) — covers correctness of ranking; perf coverage is the missing axis.
- [Problem P028 — OpenSearch 1.3.20 version debt](./028-opensearch-1-3-20-version-debt.known-error.md) — engine bump that motivates closing this gap; P028 can land Phase 1 cutover without P032 resolved (production monitoring is the fallback control), but P032 is the right follow-on for institutionalising perf gating.
- [Problem P024 — Architect agent misses performance implications](./024-architect-agent-misses-performance-implications.parked.md) — adjacent (governance tooling for perf review) but distinct (P032 is automated regression detection in CI; P024 is upfront perf reasoning by the architect agent).
