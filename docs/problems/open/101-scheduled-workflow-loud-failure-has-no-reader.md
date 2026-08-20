# Problem 101: A scheduled workflow's loud failure has no reader

**Status**: Open
**Reported**: 2026-08-18
**Priority**: 12 (High) — Impact: 3 × Likelihood: 4 — derived at capture from the description per Step 4a
**Origin**: internal
**Effort**: S — derived at capture per Step 4a
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

> **2026-08-20 — the exemplar is DELETED; the class is not.** `perf-regression.yml` was removed at the
> maintainer's direction (ADR-051, P032). Everything below describes a workflow that no longer exists, and is
> retained because the finding is about delivery rather than about that probe. **Ten scheduled workflows
> remain** — `gnaf-source-smoke` daily and nine quarterly `update-*` loaders — every one notifying the same
> way to the same reader, so nothing here is closed by the deletion.
>
> **What IS closed is this ticket's open channel-choice task.** The maintainer answered the question behind
> it: _"I don't care so much how we check it, I care more about how you monitor it. I'm not going to monitor
> it."_ So the answer is none of the options that task listed — not a GitHub issue, not the
> `addressr-search-ops` SNS topic, not a check a human already looks at, if the terminus is still the
> maintainer's attention. ADR-051 records the rule. The staleness detector this ticket built survives and now
> has a sanctioned home: an agent-read routine check, not a notification.
>
> This ticket's own root-cause section already got halfway there — _"the problem is not an absent channel, it
> is a channel terminating in an inbox nobody triages. Adding another notification route would reproduce
> it."_ What it missed is that the inbox is not untriaged by accident. Its owner never agreed to be the
> monitor.

`perf-regression.yml` asserted its own loudness. At its failure branch it emits:

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
- [x] **Enumerate them. DONE 2026-08-19 — eleven.** `gnaf-source-smoke` and `perf-regression` daily; the nine `update-{act,nsw,nt,ot,qld,sa,tas,vic,wa}` state loaders on the 21st and 28th of Feb/May/Aug/Nov. `scripts/scheduled-workflow-staleness.mjs` derives this list from the workflow files rather than hardcoding it, so a twelfth is covered on the day it lands. Applying the mechanism to all eleven remains open, pending the channel decision above.
- [ ] Decide what happens on repeated failure. A daily issue for the same break is its own noise problem, and noise is how the next one gets ignored. Prefer reopening/updating a single issue over opening N.
- [x] **Staleness assertion: BUILT 2026-08-19, and the backfill turned it from a nice-to-have into the
      main event.** `scripts/scheduled-workflow-staleness.mjs`, fixture-tested in
      `test/js/__tests__/scheduled-workflow-staleness.test.mjs` (12 cases, every guard mutation-verified).

      Two findings from the backfill reshaped it:

                  **Nine of eleven run QUARTERLY, which inverts the priority.** A failure notification cannot fire for
                  a workflow that never runs. For a daily job, "stopped running" surfaces within a day or two by
                  absence. For these the blind window is up to three months — and GitHub disables scheduled workflows
                  outright after 60 days of repository inactivity, which is exactly what a quiet quarter produces. So
                  for most of this repo's scheduled surface, staleness is not a complement to failure notification. It
                  is the ONLY thing that can detect the failure mode at all.

                  **A manual dispatch masks schedule health, so the check filters on `event=schedule`.** On 2026-08-19
                  `update-ot`'s two newest runs were both `workflow_dispatch`, sitting over a scheduled run 83 days
                  older. In a default run listing a manual green is indistinguishable from a scheduled green, so "the
                  workflow is fine" reads true while the schedule itself could have stopped firing months earlier. A
                  staleness check that takes the newest run of any kind is green over precisely the case it exists to
                  catch. The filter therefore lives inside the tested unit rather than in whoever calls it, and the
                  live `update-ot` shape is a fixture.

                  Bounds are roughly two to three missed firings: 3 days daily, 21 weekly, 70 monthly, 110 quarterly.
                  One miss is a hiccup; a tighter bound flaps, and a flapping alarm is how the real one gets ignored —
                  which is this ticket's own subject.

                  **Quarterly was 200 and that was wrong twice over.** `21,28 2,5,8,11` fires TWICE a quarter, a week
                  apart, so the gaps run 7, 7, ~85 — the largest healthy gap is 85 days, not a quarter. 200 encoded
                  four missed firings and sat ninety days past the 60-day inactivity auto-disable this exists to
                  catch. 110 is flap-free against the 85-day gap and alarms after two or three misses depending which
                  of the pair last ran. Re-derived from the cron independently rather than taken on assertion, because
                  the first value came from arithmetic against the wrong interval.

- [x] **Wire it to something. DONE 2026-08-20 — and it does NOT close this ticket.** The terminus is a
      SessionStart hook that reads a stamp and returns, spawning the real check detached; ADR-052 records the
      shape and ADR-051 the rule that constrains it. The channel-choice task above is closed by that rule:
      not email, not an issue, not SNS, if the terminus is the maintainer.

      **The residual is real and this must not be read as solved.** The detector's liveness is positively
          correlated with the failure it detects — GitHub's 60-day auto-disable fires on repository INACTIVITY,
          and a repo with no commits is a repo where no sessions start, so the check is least likely to run in
          exactly the circumstance that causes the failure. It must NOT be scored as a control reducing the risk
          of a stale production index. The correlation is a property of the class rather than of this choice:
          any in-repo detector shares it, and the only uncorrelated terminus is outside the repository.

          Two holes in the check itself were found and closed on the way, both verified present first: with `gh`
          absent it printed no finding on stdout at all, and over an empty workflow directory it printed
          `0 stale of 0` and exited 0.

- [ ] **The uncorrelated terminus, if one is ever wanted.** Everything in-repo shares the liveness
      correlation above. Something outside the repository would not. Not proposed, not costed, and recorded
      only so the residual has a named shape rather than reading as unfixable.
- [x] **Backfill. DONE 2026-08-19 — nothing else is failing.** All eleven last completed successfully. The nine quarterly loaders last fired 2026-05-28 and are 83 days old against a next-fire of 2026-08-21, so they are between runs rather than stale. The assumption that this was not unique was right to make and did not pay out this time.

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
