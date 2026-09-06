---
status: 'proposed'
date: 2026-09-06
human-oversight: confirmed
oversight-date: 2026-09-06
decision-makers: [Tom Howard]
consulted:
  [
    accessibility-agents:accessibility-lead,
    wr-voice-tone:agent,
    wr-style-guide:agent,
    wr-architect:agent,
  ]
informed: []
supersedes-clause: 092#reserved-question-account-surface
reassessment-date: 2026-12-06
---

# The account page shows the true request count, and no progress bar

## Context and Problem Statement

ADR-091 charges a customer's quota at settle, so simultaneous requests each read the
count before it moves and a hard limit can be exceeded by roughly the number in flight.
`quota_used` can therefore exceed `quota_limit`, and the account page renders both.

The page paired the raw figures with a `<progress>` element. An HTML `<progress>` CANNOT
represent a value above its maximum: the specification clamps it. So above the limit the
page drew a full bar beside text reading "5 of 3", and the two contradicted each other,
on the one screen where a customer reconciles our numbers against their own.

`<meter>` is not the fix. It clamps identically, and swapping to it would trade reliable
`progressbar` support for a role several screen readers handle poorly.

## Decision Drivers

- The page must not state the same fact two ways and have them disagree.
- Whichever representation survives has to be the one that can be true at every value.
  Only the text can.
- This is a billing surface. A customer checking it against their own logs needs the
  number they can reconcile, not a rounded one.

## Considered Options

1. **Keep the true count, remove the bar. Chosen** by the maintainer on 2026-09-06.
2. **Cap the displayed count to the limit and add a correction sentence** — render
   "3 of 3" plus a line naming the extra requests. Proposed first by the capturing agent
   and REJECTED, on review, as a regression: it replaces an accurate billing figure with
   an inaccurate one, and the true total is then stated nowhere, recoverable only by
   adding two numbers the page prints separately. Five accessibility specialists rejected
   it independently, and it inverts ADR-091's own principle that the counter should say
   what happened.
3. **Keep the bar but hide it from assistive technology.** Built, then withdrawn before
   commit. It removes the contradiction for screen reader users and leaves it on screen
   for everyone else, which relocates the defect rather than closing it. Recorded because
   it is the plausible half-fix and the next reader will reach for it.
4. **Keep the bar and mark the overflow visually.** Rejected: it needs a state
   distinction the element cannot express, and with the bar clamped, "at limit" and "over
   limit" render at identical length by construction, so any distinction would fall to
   colour alone.

## Decision Outcome

Chosen: **option 1.** The hard-cap branch renders the true `used of limit` figure and no
progress element. The text is the whole statement of usage.

Nothing is said on this surface about the billing treatment of over-cap requests. The
maintainer was asked directly on 2026-09-06 whether the page should carry that and chose
not to: the plan terms own it, and a reassurance printed beside a usage count reads as
either an apology or an invitation depending on the reader.

## What the maintainer was asked, and what this record adds

**Asked and answered on 2026-09-06.** First: show the true count or the capped one?
Answered: the true count. Second: how should the page word the fact that over-cap
requests are free? Answered: say nothing about billing here.

**This record's own additions**, following ADR-051's boundary discipline: the rejection
of options 3 and 4, the removal of the element rather than only its accessible name, and
the confirmation criteria below. Each follows from the answers; none was put as a
question.

## Consequences

- Good: one statement of usage, true at every value, in every modality.
- Good: the element that could not tell the truth is gone rather than concealed, so the
  contradiction cannot return by someone restoring a label.
- Bad: customers under their limit lose an at-a-glance visual. Accepted: the figure is
  two short numbers, and a bar that is truthful at 1 of 3 and false at 5 of 3 is the
  state this defect came from.
- Neutral: no copy changed. The rendered text is byte-identical to what shipped before.

## Confirmation

1. Browser tests cover the hard-cap branch UNDER, AT and OVER the limit. One row could
   not distinguish a fix that handles overflow from one that only ever saw the
   in-allowance case, and one row is what the suite had.
2. Every row asserts no `progress` element and no `progressbar` role in the usage region.
   Asserted on all rows, not just the over-limit one, because a bar that is truthful
   below the limit and false above it is precisely the state being removed.
3. Mutation-proved: reintroducing a clamped bar reds all three hard-cap rows.
4. The rendered text is unchanged, so the existing text assertions still pass. A change
   that altered the figure would red them.

## The clause superseded from ADR-092 — one, enumerated exactly

Enumerated rather than counted, because the `supersedes-clause` scalar is free text that
no check resolves to a location.

1. **The reserved question.** ADR-092 states: "It should be put to the maintainer before
   the account surface is built, and JTBD-005 has no outcome covering quota display, so
   nothing else will force the question."

   It was put, and answered, so the obligation is discharged and retiring it is what this
   clause supersession records. Two notes for accuracy. ADR-092's neighbouring sentence
   "Nobody was asked about that" is NOT superseded and should not be corrected: it sits
   inside a section bounding what ADR-092's own ratification attested to, and read as a
   statement about that event it stays true. And "before the account surface is built"
   was already counterfactual when written, since that page ships today.

   ADR-092 is ratified, so this is a clause supersession rather than an edit. ADR-049
   makes substance on a ratified decision prohibited REGARDLESS of whether it has
   shipped; `DECISION-MANAGEMENT.md`'s rewrite-in-place row governs retention, not
   permission, and the two were briefly conflated while this record was being written.

## Reassessment Criteria

Reassess if the quota gains a representation that can express a value above its maximum,
if an exact hard cap makes overflow impossible, or if a documented job appears covering
what a customer must be able to tell about their usage.

## Related

- ADR-092 — the billing decision that reserved this question, and the clause superseded.
- ADR-091 — why the count can exceed the limit at all.
- JTBD-005 (Create and access a managed hosted API account) — owns the account surface
  and still has NO outcome covering quota display, so this remains permitted by decision
  rather than required by a job.
