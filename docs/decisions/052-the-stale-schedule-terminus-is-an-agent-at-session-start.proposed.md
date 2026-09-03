---
status: 'proposed'
date: 2026-08-20
human-oversight: confirmed
oversight-date: 2026-09-03
decision-makers: [Tom Howard]
consulted: [wr-architect:agent, wr-jtbd:agent]
informed: []
reassessment-date: 2026-11-20
---

# The stale-schedule terminus is an agent at session start

> The terminus was chosen by the maintainer; this record fixes the shape and states what the resulting
> guarantee is and is not. **The guarantee is deliberately narrower than "a stale schedule is detected", and
> that narrowing is the most important line in this record.**

## Context and Problem Statement

`scripts/scheduled-workflow-staleness.mjs` detects scheduled workflows that have stopped firing. It shipped
complete, fixture-tested and mutation-verified on 2026-08-19, and **deliberately wired to nothing** — P101
left the terminus open because nobody had decided what a stale schedule should interrupt.

Nine of the ten scheduled workflows run quarterly. A failure notification cannot fire for a workflow that
never runs, so for those nine, staleness is the only thing that can detect the failure mode at all. GitHub
disables scheduled workflows after 60 days of repository inactivity, which a quiet quarter produces.

ADR-051 then removed most of the candidate answers: a check qualifies only if it ACTS, or if its reader is an
AGENT that surfaces it only when the finding is actionable. Email, a GitHub issue and the `addressr-search-ops`
SNS topic all terminate in the maintainer's attention and are therefore disqualified. Offered
agent-runs-it-as-routine-work, a weekly workflow that reds, a commit-path block, and leave-it-wired-to-nothing,
the maintainer chose **agent-runs-it-as-routine-work**.

Two facts measured on 2026-08-20 shaped everything else, and both were verified against the tree rather than
reasoned about:

- The check takes **11.29 seconds** — ten sequential `gh run list` calls. Far too slow to sit in front of
  every session start for a signal whose blind window is 60–110 days.
- The check had **two holes that would have made this control fake**. With `gh` absent it printed no finding
  on stdout at all, because the unreadable branch writes to stderr — so anything reading stdout saw an
  all-clear over a check that read nothing. And over an empty `.github/workflows` it printed `0 stale of 0`
  and exited 0: a clean bill of health over an empty corpus, which is P106's shape.

## Decision Drivers

- ADR-051 leaves exactly two qualifying shapes, and only one is reachable here. A scheduled corpus has no
  in-flow moment to block: there is no push, PR or release that a stale quarterly loader is adjacent to.
- A session start that stalls for 11 seconds is a cost the maintainer pays daily for a quarterly signal.
- This repo has already shipped a fail-soft SessionStart hook and been burned: ADR-038 records one whose
  "every miss is a silent `exit 0`", which injected nothing into any session for months undetected (P062).
- A check that cannot fail is indistinguishable from one that passes — the class this backlog keeps meeting.

## Considered Options

1. **Silent on any failure.** Never blocks, never annoys, reproduces P062 verbatim.
2. **Loud on every unverifiable session.** Honest, and trains the reader to ignore it — the ADR-051 defect
   arriving through the front door.
3. **Three states, escalating on the age of the last SUCCESSFUL verification.** Chosen.
4. **Leave it wired to nothing.** Foreclosed by the maintainer's choice of terminus.

## Decision Outcome

**The session-start hook reads a stamp and returns; it does no network. It prints nothing when the last check
was recent and found nothing, prints the findings when there are any, and escalates when the last successful
verification is older than the tightest cadence bound it defends. It spawns the real check detached. It
always exits 0.**

Four properties carry the design, and each exists because its absence was a realised defect:

1. **Three states, not two.** `verdict()` returns 2 for unverifiable, 1 for stale, 0 for clean, with an
   unbelievable corpus checked FIRST so an empty directory is louder than a stale workflow rather than
   quieter. `WORKFLOW_FLOOR = 5`, inclusive — five is believable, four is not, and both sides are pinned in a
   test because "floor 5" is ambiguous and the two sibling guards in this repo disagree with each other on
   exactly that boundary.
2. **The code is severity for a caller; the printed findings are the union.** A determined stale workflow is
   printed even when something else was unverifiable. Keying output off the verdict alone would hide three
   known-stale workflows behind one unread one — the exit-code conflation this change removes, inverted.
3. **Every non-silent line addresses the AGENT.** `ACTION FOR THE AGENT, not the maintainer` is asserted by
   test across every branch. A line whose only discharge is the maintainer remembering to run something is
   ADR-051's disqualified shape one layer up, and phrasing is the whole difference.
4. **Two state files, not one.** An ephemeral rate-limit token under `os.tmpdir()`, and a durable stamp at
   `.addressr-state/schedule-check.json`. A stamp in `$TMPDIR` would be wiped between sessions, making
   "verified an hour ago" indistinguishable from "never verified", so the escalation would fire every fresh
   session — option 2's defect delivered by the storage layer.

### What this guarantees, stated precisely because the obvious phrasing is false

> **No session proceeds unaware of a stale schedule.**

It is **NOT** "a stale schedule is detected within N days," and the difference is not pedantry.

**The detector's liveness is positively correlated with the failure it detects.** GitHub's auto-disable fires
on repository _inactivity_; a repo with no commits is a repo where no sessions start. So the check is least
likely to run in exactly the circumstance that produces the failure. ADR-051's corollary that "deleting an
unread instrument is not the same as removing protection, and the difference must be established rather than
assumed" has a mirror obligation, and this is it: adding an instrument is not the same as adding protection.

What survives the correlation is that the harm from a disabled loader is realised when the data goes stale or
when someone next ships — and the first session after the repo wakes is upstream of both. The correlation
costs timeliness, not detection-at-the-moment-of-consequence.

**The correlation is a property of the class, not of this choice.** Any in-repo detector shares it, and the
recursive case makes it vivid: a watchdog implemented as a scheduled workflow is disabled by the very event it
watches. The only uncorrelated terminus is outside the repository. This is recorded so a future reader does
not mistake the residual for a defect in this design and go hunting for a better in-repo shape that does not
exist.

### Consequences

**Good.**

- Session-start cost falls from a measured 11.29s to a file read.
- The refresher is **self-checking**: if the detached child never runs, the stamp ages and the escalation
  fires. No second instrument is needed to watch it.
- Two pre-existing holes in the underlying check are closed, and both were verified present before the fix.
- `--event schedule` now bounds the `gh` window to scheduled runs, so dispatches can no longer evict the
  scheduled evidence and make a healthy workflow report as never-fired.

**Bad.**

- **The reporter is NOT self-checking**, and no care in its implementation makes it so. Unregistered,
  crashing, renamed or shadowed, it is observationally identical to a healthy repo — P062's class. It is
  covered by `schedule-hook-wiring.test.mjs` from outside, which is the only place such a check can live.
- **The floor detects collapse, not erosion.** With ten workflows a floor of five tolerates losing half the
  corpus silently. That is the deliberate trade against a hardcoded expected list, which would not cover an
  eleventh workflow on the day it lands (P101 task 3).
- **Additive latency.** The reporter prints from a stamp up to `VERIFICATION_WINDOW_DAYS` old, so a daily
  workflow can be stale for up to `daily + window` days before anything is said. The window is derived from
  `Math.min(...MAX_AGE_DAYS)` rather than chosen, which bounds it at twice the tightest bound and moves it
  automatically if the bounds move.
- **This does NOT close P101's "wire it to something" task**, and must not be scored as a control reducing
  the risk of a stale production index. The residual stays open. P101's channel-choice task IS closed —
  ADR-051 answered it — and only the wiring survives.
- The repo now owns a `SessionStart` hook for the first time, so this is a fourth enforcement surface
  alongside `package.json` scripts, git hooks and CI.

## Confirmation

1. Both pre-existing holes verified present on 2026-08-20 and closed: an empty `.github/workflows` now exits
   **2** with `only 0 scheduled workflows found, below the floor of 5`; with `gh` absent, findings appear on
   **stdout** as `UNKNOWN` lines and the run exits **2**. A normal run exits 0 with `0 stale of 10`.
2. Six mutations of `scripts/schedule-report.mjs` all CAUGHT: softening the agent-addressed instruction into
   a request to the maintainer, suppressing the stale-findings filter, silencing the never-verified branch,
   failing open on an unreadable timestamp, dropping the unverifiable branch, and never escalating on
   verification age.
3. End-to-end on a fresh-clone shape (no stamp, no token): the reporter emits the never-verified block and
   exits 0; the detached refresh then writes `.addressr-state/schedule-check.json` with `0 stale of 10`
   without blocking the session.
4. `schedule-hook-wiring.test.mjs` reconciles every hook `command` in `.claude/settings.json` against the
   filesystem, floors the command corpus non-empty, and asserts the stamp is BOTH ignored (`git check-ignore`)
   and untracked (`git ls-files --error-unmatch`) — because `check-ignore` proves the rule and says nothing
   about a path tracked before the rule landed.
5. **Owed, not discharged:** ADR-038's end-to-end criterion — that a fresh session still emits the
   `CROSS-SESSION BRIEFING — critical points` block — has NOT been re-verified since this hook was
   registered alongside the plugin's. Displacing it would reproduce P062 while this hook prints happily.

## Related

- **ADR-051** (`051-a-check-with-no-reader-but-the-maintainer-is-not-a-control.proposed.md`) — the rule this
  applies. Its two qualifying shapes are what leave agent-read as the only reachable terminus here.
- **ADR-038** (`038-per-topic-briefing-tree-session-start-surface.proposed.md`) — **composes with, does not
  modify.** Its rejection of a repo-local hook was scoped to _duplicating_ the plugin's briefing-content
  surface; this injects a computed signal the plugin does not produce, so the premise of that rejection does
  not reach it. Sited on the ADR-011 side of the axis ADR-038 draws: a repo-local hook this repo owns, can
  change, and can test.
- **ADR-048** (`048-moved-path-referrers-resolved-by-executable-guard.proposed.md`) — its NOT-COVERED list
  still stands. One corpus of bare script paths is now guarded; the general case is not, and the list must
  not be narrowed on the strength of this.
- **P101** (`../problems/open/101-scheduled-workflow-loud-failure-has-no-reader.md`) — channel-choice task
  closed, wiring task NOT closed, liveness-correlation residual recorded there.
- **P103** (`../problems/open/103-workflow-referrers-outside-guard-coverage-rot-unseen.md`) — its bare-script
  -path class, one corpus covered.
- **P062 / ADR-038** — the silent-`exit 0` precedent this design is shaped around rather than repeating.
- **JTBD-400** (Ship Releases Reliably From Trunk), persona `addressr-maintainer` — "checkable artefacts, not
  memory" is the outcome served.
