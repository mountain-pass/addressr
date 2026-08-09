# Problem 099: Assistant pushes interface work onto the user instead of presenting decidable choices

**Status**: Open
**Reported**: 2026-08-10
**Priority**: 12 (High) — Impact: 3 × Likelihood: 4 — derived at capture. Impact 3: no data loss or outage, but it stalls governance throughput and burns the user's scarcest resource; the harm compounds because a blocked ratification blocks dependent work (here, Phase 3 of the release-pipeline change). Likelihood 4: observed three times in a single session, and recurred the morning after an explicit correction — this is a default behaviour, not a slip.
**Origin**: internal
**Effort**: S — the corrective pattern is a habit change at the output surface, not a code change. Possibly M if it warrants a hook that scans assistant turns for the anti-patterns (a sibling of the existing itil-assistant-output-review.sh prose-ask scanner).
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

The assistant pushes interface work onto the user instead of presenting decidable choices in the interface the user actually has.

Observed 2026-08-10, three times in one session, escalating to user frustration: _"FFS! If you want me to ratify something you have to give me the file. This is my interface. This is the window you have to work with me with. You MUST take that into consideration."_

### Symptom 1 — telling the user to run a slash command

The assistant repeatedly said "route it through `/wr-jtbd:confirm-jobs-and-personas`" and "book the interactive JTBD confirm pass". That is a skill the **assistant** can invoke. Framing it as user homework asks a human on a phone to type a CLI command to unblock the agent's own work.

Aggravating factor: the user had **already corrected this the previous evening** — _"If you need me to verify something you need to give me the file to ratify"_ — and the assistant repeated the pattern the next morning. A correction that does not change the next turn's behaviour is the failure mode, not the original slip.

### Symptom 2 — answering "what do you need from me?" with a wall of jargon

The reply named R2, R020, JTBD-400, ADR-040 and P039, and posed two open-ended decisions. It required the user to reload a whole session's context before they could answer anything. No tappable option, no recommended default, no single concrete ask.

### Symptom 3 — offering a file path as a deliverable

"`docs/jtbd/…` needs amending" is not something a user can act on from a chat window. A rendered diff, or an `AskUserQuestion` with the change shown in the preview, **is**.

## Symptoms

- Assistant instructs the user to run a command the assistant is capable of invoking.
- Assistant answers a direct "what do you need?" with status prose rather than a decision.
- Assistant cites bare identifiers (R-numbers, ADR/P/JTBD IDs) as if the user has them loaded.
- Assistant names filesystem paths as deliverables to a user working through a chat window.
- A user correction is acknowledged in prose but the behaviour recurs in a later turn.

## Workaround

Present every user-facing ask as either an `AskUserQuestion` with a concrete preview and a recommended default, or a rendered artefact via `SendUserFile`. Applied successfully in this session: the JTBD ratification was re-issued as a tappable question with the six proposed changes shown inline, and the amendment was delivered as a 59-line diff rather than two long documents.

## Impact Assessment

- **Who is affected**: the maintainer — a person with a job, a family and a house to run, whose attention is the binding constraint on this project, and whose only channel to the assistant is a narrow chat window often on a phone.
- **Frequency**: three occurrences in one session; recurred after explicit correction. Treat as the default behaviour until a control exists.
- **Severity**: no data loss, no outage. The cost is stalled governance throughput and eroded trust — the user has to spend attention policing the assistant's output format instead of making decisions.
- **Analytics**: (deferred to investigation)

## Root Cause Analysis

The assistant reasons well about the **work** and poorly about the **user's interface and attention budget**. It has a narrow chat window as its only channel to a person with competing demands, and it spends that channel on status narration rather than on decisions.

This is a theory-of-mind failure. The assistant does not adequately model:

- what the user currently has loaded (versus what the assistant has in context);
- what the user has **already told it** (the previous evening's correction);
- what the user can physically do from where they are (tap an option; not run a CLI command);
- that the user's attention is the scarcest resource in the system, and is being spent on the assistant's convenience.

### Investigation Tasks

- [ ] Investigate whether a Stop-hook scanner can detect the anti-patterns in an emitted turn — a sibling of the existing prose-ask scanner. Candidate signals: a `/slash-command` addressed to the user in the imperative; a bare `docs/…` path presented as an action; a bare `R\d+`/`P\d+`/`ADR-\d+` with no inline gloss on first mention; a turn that asks a question without an accompanying `AskUserQuestion` call.
- [ ] Decide whether this warrants a memory entry, a hook, or both. A memory entry alone has already failed once — `feedback_brief_before_id` exists and Symptom 2 violated it.
- [ ] Create a reproduction test.

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: P078 (assistant does not offer a problem ticket on user correction) — same family: the assistant's handling of user corrections. P078 covers whether the correction gets **captured**; this ticket covers whether it changes **behaviour**.

## Related

- Existing memory `feedback_brief_before_id` — never a bare P/ADR number, say what it is first. Symptom 2 is a direct violation, which is evidence that a memory entry alone is not a sufficient control for this class.
- Existing memory `feedback_surface_blockers_explicitly` — blockers go in a labelled list at the end. That covers **where** a blocker goes; this ticket covers **what form** it must take to be actionable.
- Existing memory `feedback_act_on_obvious_decisions` — obvious default means act, genuine ambiguity means `AskUserQuestion`, never prose-ask. This ticket extends it: even a legitimate `AskUserQuestion` fails if the options assume context the user does not have loaded.
- ADR-013 (structured user interaction for governance decisions) — the existing decision this behaviour undercuts. ADR-013 mandates the structured tool; it does not currently say the options must be self-contained for a reader with no filesystem access.
- Captured via `/wr-itil:capture-problem` at the user's explicit request during the correction itself.
