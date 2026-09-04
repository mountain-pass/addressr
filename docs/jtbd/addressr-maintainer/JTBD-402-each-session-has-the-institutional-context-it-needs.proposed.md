---
human-oversight: confirmed
oversight-date: 2026-09-03
status: proposed
job-id: each-session-has-the-institutional-context-it-needs
persona: addressr-maintainer
date-created: 2026-08-23
screens:
  - 'docs/briefing/** — the per-topic tree the SessionStart hook surfaces, and its 2 KB Tier-1 budget. The budget is the job: an unbounded briefing is one nobody reads, which fails the job as surely as no briefing at all.'
  - "docs/retros/** — where a session's learnings are written down before they decay with the context window."
  - 'the SessionStart briefing surface (wr-retrospective) — the delivery mechanism. P062 exists because it delivered nothing to AFK subprocess sessions while reporting success.'
  - "docs/decisions/README.md — the compendium, which is the architect agent's routine load surface under ADR-077. Named here as well as on JTBD-400 because the two jobs want different things from it: JTBD-400 wants its facts correct, this job wants it READABLE at session start."
---

# JTBD-402: Each working session has the institutional context it needs

> Created 2026-08-23 from a JTBD advisory raised during AFK work on P062 and confirmed by the maintainer. The advisory's point: P062's harm was traced to JTBD-400 (ship releases reliably from trunk), and that trace is thematically close but mechanically wrong. Losing institutional context between sessions is not a release-pipeline defect. It shows up as one only because a context-blind session then makes a release mistake.

## Job Statement

When I start a working session — my own, or an agent's, or an AFK subprocess — I want the decisions, corrections and traps this project has already paid for to be present without my remembering to fetch them, so that I do not re-make a mistake that is already written down.

When I finish a session that learned something, I want that learning captured while it is still true and still specific, so the next session inherits it rather than rediscovering it.

## Desired Outcomes

- A session opens already holding the corrections that would otherwise be re-earned. The measure is not that a briefing exists; it is that a known trap is not re-sprung.
- **The briefing is short enough to be read.** The 2 KB Tier-1 budget is a feature. An unbounded briefing fails this job in the same way an absent one does, more expensively.
- Delivery is observable. A briefing mechanism that silently reaches no session — P062's exact failure — is worse than none, because the absence is invisible and the record looks maintained.
- What a session learns is written down before the context that made it legible is gone.

## Persona Constraints

- **Addressr Maintainer** (primary): sole maintainer, so there is no colleague who remembers instead. Much of the work runs AFK in subprocesses that cannot ask a question, which makes the briefing the only channel — and is precisely where P062 found it delivering nothing.

## Current Solutions

- **The per-topic briefing tree plus its SessionStart hook.** Current mechanism, and the one P062 found broken for subprocess sessions.
- **Reading the decision records directly.** Authoritative and far too large for a session start; the compendium exists because of this.
- **Remembering.** How it worked before, and the reason this job exists.

## Confirmation

- Every session type — interactive, agent, AFK subprocess — receives the briefing. **NOT MET at P062's filing**, which is the ticket's subject; P062 sits in `verifying/` pending observation.
- A briefing that fails to deliver fails LOUDLY. **NOT MET.** P062's whole shape was silent non-delivery, and nothing yet asserts that a session received one.
- The Tier-1 budget holds. Checkable, and it is checked by the retro cadence rather than by anything mechanical.

## Reassessment Criteria

- **A correction recurs that the briefing already carried.** That is this job failing in the only way that matters, and it is worth more than any measure of the mechanism.
- **The briefing mechanism changes again.** It has already moved from a single file (ADR-019, superseded) to a per-topic tree (ADR-038). A third move should re-derive this job's screens rather than inherit them.
- **The 2 KB budget is raised rather than curated.** Raising it is the cheap response to a full briefing and it converts this job's asset into a liability.
