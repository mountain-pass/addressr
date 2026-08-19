# Problem 101: A scheduled workflow's loud failure has no reader

**Status**: Open
**Reported**: 2026-08-18
**Priority**: 12 (High) — Impact: 3 × Likelihood: 4 — derived at capture from the description per Step 4a
**Origin**: internal
**Effort**: S — derived at capture per Step 4a
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

`perf-regression.yml` asserts its own loudness. At its failure branch it emits:

> `::error::Perf regression probe FAILED TO RUN … the nightly perf signal is invalid until it is fixed`

**Six consecutive nights of that annotation went unread.** From 2026-08-12 to 2026-08-17 the job died at `Generate version file` — `npm run genversion` no longer resolved at the repo root after the ADR-046 restructure — so no run reached k6 at all. It was found on 2026-08-18 only because an unrelated `gh run list` happened to include the row.

The repoint is fixed (see P032's 2026-08-18 note). **This ticket is the other half: the design claim "it fails loudly" is false when nothing reads the noise.** A `::error::` annotation lands on a run summary page nobody opens. So a broken probe and an absent probe are observationally identical, which makes the probe's green indistinguishable from its absence.

This is the inverse of the failure class this repo is usually careful about: silent-green is a check that passes for the wrong reason; this is a **standing red that reaches no one**. Both collapse to the same root — the signal carries no information — and naming them as a pair is the useful part.

**Not "worse than silent-green", though, and an earlier draft of this ticket claimed that.** It does not survive the repo's own numbers. R023's realised instance let a Babel 8 regression that made the published package unloadable sit on master believed clean — a user-facing artefact, scored 16 inherent. This cost the absence of an advisory signal that gates nothing and has never yet produced a clean baseline, scored 12. And a standing red leaves six greppable `failure` rows that were in fact found in six days; a false green leaves nothing to find at all. On detectability and on blast radius, silent-green is worse.

The claim that survives is narrower and checkable: the workflow **asserts** loudness as a property of itself, and that assertion is false without a reader.

## Symptoms

1. A scheduled workflow can fail indefinitely with no one aware. Demonstrated: six nights.
2. Because it is `schedule`-triggered, it blocks no push and reds no PR check, so the ordinary feedback surfaces never show it.
3. Downstream ticket state silently goes stale. P032's exit criterion — "awaiting a clean validation run" — was unreachable for the whole window while the ticket read as merely pending.
4. Any future break in this workflow, or in any other scheduled workflow, recurs the same way. Nothing structural changed when the repoint landed.

## Workaround

Manually run `gh run list --workflow="Perf Regression"` and read the conclusions. That is operator memory rather than a checkable artefact, which is precisely what JTBD-400's "Infra-boundary release steps are checkable artefacts, not memory" outcome exists to remove.

## Impact Assessment

- **Who is affected**: the maintainer relying on the nightly perf signal, and anyone reading P032's status as accurate.
- **Frequency**: continuous while broken. One occurrence has already run six nights.
- **Severity**: Moderate. No production impact — the probe measures, it does not serve. The cost is a guard believed to be watching that is not, and a performance regression that would consequently ship unnoticed.
- **Analytics**: 6 of 6 scheduled runs failed in the observed window (2026-08-12 to 2026-08-17), all at the same step.

## Root Cause Analysis

The workflow's failure path was designed to be loud and **is** loud. What was never designed is a _reader_.

**CORRECTED at capture.** This first read "the annotation has no delivery mechanism at all", which is false and contradicted P032's own analysis in this repo: _"GitHub notifies on **failed** scheduled runs, not on `::warning::` or step summaries. Under the new shape a broken probe fails and therefore notifies."_ That is right. The distinction matters:

- The `::error::` **annotation** has no delivery mechanism — it renders on a run summary page someone must choose to visit.
- The **run-level failure** does have one. GitHub emails on failed scheduled runs, and under the exit-code discrimination P032 shipped, a broken probe fails rather than warning, precisely so it would notify.

So the channel existed, worked as designed, and fired for six consecutive nights — **and still reached nobody**. That is a worse finding than the one I first wrote, not a milder one: the problem is not an absent channel, it is a channel terminating in an inbox nobody triages. Adding another notification route would reproduce it.

For a push-triggered workflow the read is forced by the ordinary flow — a red check on the branch you are pushing, in front of you at the moment you care. A scheduled run has no such moment, so its notification competes with everything else in an inbox and loses.

The repo has a working pattern for exactly this and it is used elsewhere: the search-domain CloudWatch alarms publish to the `addressr-search-ops` SNS topic and email a human. Nothing equivalent exists for CI.

### Investigation Tasks

- [ ] **First, and cheapest: find out why the EXISTING notification did not reach a human.** GitHub already emailed on six failed scheduled runs. Check the account's Actions notification settings, whether scheduled-workflow failure email is enabled, and whether it is being filtered. Answering this may make every option below unnecessary — and if it does not, it tells you what a new channel has to beat.
- [ ] Only then decide an additional mechanism, cheapest first: open/update a GitHub issue on failure (native, greppable, and unlike email it persists until closed); notify via the existing `addressr-search-ops` SNS topic; or fail a check a human already looks at.
- [ ] Apply it to **every** `schedule`-triggered workflow, not just this one — enumerate them first. The defect is the trigger class, not the file.
- [ ] Decide what happens on repeated failure. A daily issue for the same break is its own noise problem, and noise is how the next one gets ignored. Prefer reopening/updating a single issue over opening N.
- [ ] Consider a staleness assertion: if the newest successful run of a scheduled workflow is older than N days, red something that IS read. This catches "stopped running entirely" as well as "runs and fails", which a failure-triggered notification does not.
- [ ] Backfill: check whether other scheduled workflows are currently failing unnoticed. This one was found by accident; assume it is not unique.

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: P032 (no CI perf regression detection) — P032 owns "the probe does not exist / measures the wrong thing"; this owns "the probe's failure has no audience". Sibling, not duplicate: fixing either leaves the other live.

## Related

- **P032** (`docs/problems/known-error/032-no-ci-perf-regression-detection.md`) — carries the 2026-08-18 note that its exit criterion was unreachable for the six-night window.
- **ADR-046** (packages are distributable, apps are deployed) — the restructure whose unrepointed referrer caused this instance. Its Confirmation criteria pin workspace-membership invariants but say nothing about repointing referrers to moved paths, which is why two workflow referrers rotted with the ADR fully satisfied.
- **JTBD-400** (Ship Releases Reliably From Trunk), persona `addressr-maintainer` — the "checkable artefacts, not memory" outcome an unread alarm fails.
- `test/js/__tests__/workflow-npm-scripts-resolve.test.mjs` — the guard added 2026-08-18 that catches the _specific_ rot class (an `npm run` that does not resolve in the scope it runs in), deliberately sitting outside the tier it protects so a workflow nobody executes still cannot carry an unresolvable script. It does not address this ticket, which is about delivery rather than detection.

Captured via `/wr-itil:capture-problem`. Hang-off check: P032 shares the file and the signal but owns the probe's existence and correctness, not the audibility of its failure — the architecture review that surfaced this drew the same boundary, so it proceeds as a sibling rather than an expansion.
