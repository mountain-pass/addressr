---
status: proposed
rfc-id: ci-perf-regression-probe
reported: 2026-07-24
human-oversight: unconfirmed
decision-makers: [Tom Howard]
problems: [P032]
adrs: []
jtbd: [JTBD-001, JTBD-400]
stories: []
---

# RFC-007: CI perf-regression probe (small k6 profile + nightly workflow)

**Status**: proposed
**Reported**: 2026-07-24
**Problems**: P032
**ADRs**: (none — a proposed ADR recording the standing perf-regression methodology is a follow-on; see the architect note in P032)
**JTBD**: JTBD-001 (Search and Autocomplete — "results within 200 ms" outcome), JTBD-400 (Ship Releases Reliably From Trunk — maintainer CI vehicle)

## Summary

Add a small, deterministic k6 regression-detection profile plus a separate nightly/on-demand CI workflow so search/retrieve p95 regressions are caught automatically — closing P032. The existing 38-minute stress profile (`test/k6/script.js`) stays for on-demand "find the breaking point" runs; this is the complementary "did it regress?" instrument.

## Driving problem trace

- **P032** (No CI perf regression detection — k6 stress profile is on-demand only): `package.json` defines `test:performance` (a 38-min, 20-VU stress ramp) but no CI job runs it, and its shape is wrong for regression detection. Ranking/scoring changes (ADRs 025–028) and the OpenSearch engine bumps (ADR 029/035) ship with cucumber correctness coverage but no perf coverage; a p95 regression on the search/retrieve path can reach production undetected, with prod monitoring as the only control.

## Scope

Implements the Investigation-Task leans documented on P032. The fix is three artefacts, authored together (single logical change; CI + test infra only, so no changeset per the workflow-only discipline — cf. RFC-002):

1. **`test/k6/regression.js`** — a small profile: a 15 s warm-up scenario (untracked by thresholds) then 60 s at 5 constant VUs (tracked, `phase:main`). Deterministic fixed-sequence queries (no `Math.random`, so runs are comparable commit-to-commit) against the OT fixture on `:6060`, exercising both the search (`/addresses?q=`) and retrieve (first-hit `self` href) paths. Conservative p95 thresholds sized to survive GitHub-hosted-runner variance: search p95 < 1500 ms, retrieve p95 < 1000 ms, checks rate > 0.95. k6 exits non-zero on a breach, failing the job.
2. **`test:perf:regression`** npm script (`k6 run test/k6/regression.js`) — also the local handle so a maintainer can run the probe before a risky merge (the JTBD-400 "find out locally" preference).
3. **`.github/workflows/perf-regression.yml`** — a SEPARATE workflow (NOT folded into `release.yml`'s matrix, NOT per-push): `workflow_dispatch` + nightly `schedule`. Spins up an OpenSearch 3.5.0 service (the production engine), generates `version.js`, prepares the slim OT G-NAF fixture (same steps as `release.yml` build-and-test), loads it (`babel-node loader.js`, `ES_INDEX_NAME=ot COVERED_STATES=OT`), starts the API server (`babel-node src/server2.js` on `:6060`), waits for `/health`, then runs the probe.

**Chosen approach rationale** (chosen-path prose only per ADR-070): a separate nightly/dispatch workflow keeps the perf gate off the release-blocking path so the trunk-based release loop stays fast (per the JTBD-400 context that a slow pipeline "costs a recovery commit and a wasted pipeline run"); a regression here is advisory-loud, not a release blocker. Single production-engine target (3.5.0) because perf is a wall-clock trend on the engine prod runs, not a cross-version compat check (that is `release.yml`'s 2.19/3.5 matrix). Conservative first-cut thresholds because GitHub-hosted runners are noisy — tightening from quieter local-dev numbers would flap.

Deliberately out of scope (P032 Investigation Tasks left open):
- Threshold tightening from real runner-variance characterisation (the committed thresholds are a first cut; tighten after a few nightly baselines establish the runner's spread).
- The one-shot pre-cutover stress run against a candidate AWS-managed domain (ADR 029 Phase 1 step 6) — a manual run, not CI cadence.

## Stories

Per ADR-089 an RFC's work-breakdown is stories on a story map, not a `## Tasks` list. The three artefacts above were authored together in one commit (the fix scope is atomic and small), so no in-flight story decomposition drove the work. The formal story-map + story artefacts are a **deferred follow-on** to author at `/wr-itil:manage-rfc accepted` (queued — the AFK iter that produced this RFC treated the fix as a single atomic change under the ADR-071 pinned direction). Remaining lifecycle work before this RFC can close:

- [ ] Push + observe the first nightly / `workflow_dispatch` run; confirm the thresholds do not flap on real GitHub-hosted-runner variance. This is P032's verification gate → Verifying → Closed.
- [ ] Back-fill the story-map + ≥1 story at `manage-rfc accepted` (ADR-089), or record why the atomic-fix shape needs none.
- [ ] (Architect follow-on) Record a proposed ADR capturing the standing perf-regression methodology (direction pinned same-turn per ADR-064).
