---
status: 'proposed'
date: 2026-08-20
human-oversight: confirmed
oversight-date: 2026-08-20
decision-makers: [Tom Howard]
consulted: [wr-architect:agent, wr-jtbd:agent]
informed: []
reassessment-date: 2026-11-20
---

# A check whose only reader is the maintainer is not a control

> Captured after the maintainer was asked whether a nightly probe should alert them and answered by rejecting
> the premise of the question. The decision substance is theirs, quoted below in their own words. **The
> generalisation past this one probe was this record's addition rather than theirs, and was RATIFIED on
> 2026-08-20** — presented with the scope spelled out (all scheduled jobs, production alerting, and
> "the maintainer is notified" scoring zero as a control) against the narrower alternative of scheduled jobs
> only, they adopted it as written. It binds everywhere.

## Context and Problem Statement

`perf-regression.yml` ran nightly, measured search latency against a seeded fixture, and asserted its own
loudness — at its failure branch it emitted `::error::Perf regression probe FAILED TO RUN … the nightly perf
signal is invalid until it is fixed`.

From 2026-08-12 to 2026-08-17 it died at `Generate version file` on **six consecutive nights**. GitHub emailed
on every one of them, which is the channel working exactly as designed. It was found on 2026-08-18 only
because an unrelated `gh run list` happened to print the row.

P101 diagnosed that as a channel terminating in an inbox nobody triages. That diagnosis was too narrow, and
the maintainer said so when the finding was put to them. Asked what should be done about the six emails, they
replied: _"I got them, but what do you want me to do about them? What is the nightly job anyway?"_ — the
instrument's only consumer did not recognise the instrument. Offered keep-but-silence,
alert-only-if-persistently-broken, make-it-measure-production-first, or delete, they chose **delete**. Asked
whether the record should rule out automated perf checking entirely or only runner-measured perf checking,
they rejected both framings:

> _"I don't care so much how we check it, I care more about how you monitor it. I'm not going to monitor it."_

That reframes the problem. The defect was never the measurement target and never the delivery mechanism. It
was that the terminus of the signal was a person who is not watching, and who had not agreed to watch.

This is not confined to one workflow. Ten scheduled workflows remain — `gnaf-source-smoke` daily and nine
quarterly `update-*` state loaders — every one of them notifying the same way, to the same reader.

## Decision Drivers

- The maintainer works without review-by-default and without a second reader. Attention is the scarce
  resource, and a signal that spends it without changing an outcome is a cost, not a control.
- This repo already scores disciplines at zero. R028 refuses to credit "the maintainer recomputing before
  commit"; P107 records that disciplines are what failed. A notification aimed at a human is a discipline
  wearing an automation costume.
- Adding a second channel for an unread first channel reproduces the defect at higher cost, and P101 says so
  in terms: _"Adding another notification route would reproduce it."_
- JTBD-400's outcome _"Infra-boundary release steps are checkable artefacts, not memory"_ already names the
  principle for release steps. Nothing extended it to monitoring.

## Considered Options

1. **Silence the probe, keep it running.** Cheapest. Leaves an instrument nobody reads, which is the
   maintenance cost without even the notification.
2. **Alert only after repeated failure.** Reduces volume, not the defect: the terminus is unchanged.
3. **Point it at production instead of a rented runner.** Would fix what it measures. Does not fix who reads
   it, so a production-measuring probe emailing the same inbox fails identically.
4. **Delete the probe and record the general rule.** Chosen.

## Decision Outcome

**A check whose only consumer is the maintainer's attention is not a control, and must not be counted as one
in any risk assessment, confirmation criterion, or ticket closure.**

A check earns the name only if it does one of these:

- **It acts.** It blocks, fails, or refuses something already in the flow, at a moment the maintainer is
  present for their own reasons — a pre-commit refusal, a red PR check, a release gate.
- **Its reader is an agent, not the maintainer.** Something reads it as part of routine work and surfaces it
  only when the finding is actionable. `npm run check-schedules` is the existing example of this shape.

Corollaries, stated because each of them was a live proposal in this repo before today:

- **"Send it somewhere else" is not a fix.** A different inbox, a Slack channel, an SNS topic, or a GitHub
  issue is the same instrument if its terminus is still the maintainer's attention.
- **"Run X manually before risky changes" is not a control.** It is operator memory, which JTBD-400 exists to
  remove. It must not be recorded as a workaround or as a mitigating control.
- **A dashboard is not monitoring.** It requires someone to choose to look. `SearchLatency` p95 exists today
  only as a CloudWatch dashboard widget in `locals.search_parity_widgets`, with no alarm behind it.
- **Deleting an unread instrument is not the same as removing protection**, and the difference must be
  established rather than assumed. For this probe it was established: it gated at 7.5× the job's latency
  outcome, advisory-only; its retrieve leg measured zero requests for its entire life while printing
  `✓ p(95)=0s`; exactly one run in the whole record reached k6 and passed.

### Consequences

**Good.**

- The ten remaining scheduled workflows inherit a rule rather than each being argued separately.
- P101's open channel-choice question is answered: not email, not an issue, not SNS, if the terminus is the
  maintainer. Its staleness detector — deliberately wired to nothing pending that choice — now has a
  sanctioned home, which is an agent-read routine check rather than a notification.
- The risk register gains a disqualifier it can apply mechanically. A control described as "the maintainer
  is notified" is now scored at zero reduction by rule, not by argument each time.

**Bad, and the second one is worse than it looks.**

- CI-side latency detection is gone with nothing replacing it. **The gap is narrower than a first draft of
  this record claimed, and the correction matters because it changes what is owed.** That draft said there is
  "no automated latency control anywhere", reasoning only from this repo's own Terraform. That is right about
  AWS — `apps/addressr-deployment/main.tf` carries exactly two `aws_cloudwatch_metric_alarm` resources and
  both watch `SearchableDocuments`, while `SearchLatency` p95 exists solely as a dashboard widget in
  `locals.search_parity_widgets`. It is wrong about the system: **the API gateway already measures
  end-to-end latency continuously, across every consumer and region, and exposes an alerting surface.** That
  is a strictly better measurement than the deleted probe's — real traffic and real clients rather than a
  seeded fixture on a rented runner — and it existed the whole time the probe was being argued about.
  Deriving the state of the world from the files in the repo, when the repo is one component of a system that
  includes a marketplace gateway and a CDN in front of it, is its own failure mode and is what produced the
  overstatement.
- What is genuinely owed, therefore, is not measurement. It is a **terminus**: whether an alert is
  configured on that existing signal, and whether it lands somewhere that ACTS or that an AGENT reads rather
  than in the maintainer's inbox. Under this decision's own rule an alert routed to the maintainer would not
  qualify. Captured separately rather than folded in here.
- **No figures from that gateway belong in this repo.** It is public, and traffic volumes, consumer counts
  and revenue are confidential (see R004, which names traffic counts in public ADR prose as a live risk).
  This record deliberately states the shape of what is measured and none of the values.
- **This rule can be used to argue against building anything**, since almost any new check can be described
  as ending in someone's attention. That reading is wrong and is foreclosed here: the rule disqualifies a
  check whose ONLY effect is to notify. It does not license deleting a check that acts, and it does not
  license leaving a real gap unfilled on the grounds that any filler would need a reader. The obligation it
  creates is to find an acting or agent-read shape, not to give up.
- ADR-048's Confirmation criterion 4 used `perf-regression.yml`'s repoint as one of two mutation exemplars.
  That criterion is written as a discharged event and is not falsified retroactively, but a future
  reassessment cannot re-run that half. Recorded here rather than by amending ADR-048, which is ratified and
  whose substance is not this decision's to edit.

## Confirmation

1. `.github/workflows/perf-regression.yml`, `test/k6/regression.js`, `scripts/perf-validity.mjs` and the
   three `perf-*` test files are absent from the tree, and `test:perf:regression` is absent from
   `package.json`.
2. `test/k6/script.js`, `test/k6/retrieve-url.js`, `test/js/__tests__/k6-retrieve-url.test.mjs` and
   `test:performance` all survive, and `npm run test:performance` still parses — ADR-031's soak-gate
   criterion 5 needs that profile and it is the only k6 left. Verified by the surviving import chain, which
   is the specific thing an over-wide deletion would have broken.
3. No `aws_cloudwatch_metric_alarm` was added or removed by this change, and no alerting was altered on the
   API gateway. Whether a latency alert is configured there is NOT asserted by this record — it was not
   verified, and the honest state is unknown rather than absent. That question is the separately-captured
   item, and it must be answered by looking rather than by inference from this repo's files.
4. `npm run test:js` passes with the deleted files gone, including `doc-links-resolve` — which reds on a
   documentation link to a deleted path, and is why P032's two links to the removed artefacts were converted
   to plain text in the same commit.

## Related

- **P032** (`docs/problems/known-error/032-no-ci-perf-regression-detection.md`) — the gap the deleted probe
  addressed. Now unmitigated by choice, with the retirement note recording precisely what the probe did and
  did not measure.
- **P101** (`docs/problems/open/101-scheduled-workflow-loud-failure-has-no-reader.md`) — the six unread
  nights. Its open channel-choice task is answered by this decision; its staleness detector survives and its
  class is untouched, because ten scheduled workflows remain.
- **RFC-007** (`docs/rfcs/RFC-007-ci-perf-regression-probe.proposed.md`) — rejected 2026-08-20, not
  superseded: nothing replaces the probe. Never ratified, so nothing downstream depended on it.
- **ADR-031** (`031-read-shadow-for-search-backend-migrations.proposed.md`) — its soak-gate criterion 5 is why
  `test/k6/script.js` survives the deletion. Untouched by this record.
- **ADR-048** (`048-moved-path-referrers-resolved-by-executable-guard.proposed.md`) — composes with, does not
  modify. Its Confirmation criterion 4 loses one mutation exemplar; see Consequences.
- **JTBD-400** (Ship Releases Reliably From Trunk), persona `addressr-maintainer` — its "checkable artefacts,
  not memory" outcome is the principle this decision extends from release steps to monitoring.
- **JTBD-001** (Search and Autocomplete) — its "results within 200 ms" outcome is the one with a live
  measurement behind it, at the gateway, against real traffic. Recorded plainly: the deleted probe never
  defended it, gating at 7.5× that figure on synthetic load. What is missing is an alert with a qualifying
  terminus, not a number.
