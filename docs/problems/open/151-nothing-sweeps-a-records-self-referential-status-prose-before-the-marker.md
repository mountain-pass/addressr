# Problem 151: Nothing sweeps a record's self-referential status prose before the oversight marker is written

**Status**: Open
**Reported**: 2026-09-19
**Priority**: 8 (Medium) — Impact: 2 × Likelihood: 4 — derived at capture from the description per Step 4a
**Origin**: internal
**Effort**: S — derived at capture per Step 4a
**JTBD**: JTBD-402
**Persona**: addressr-maintainer

## Description

The ratification drain says the confirmation write is the final content write, and that a
ratified record's body is not edited afterwards. Nothing checks that the body is ready for
that write. A record whose prose talks about its own unconfirmed state is falsified by the
very act of confirming it, and the rule then forbids repairing the damage.

**What happened, on 2026-09-19, on ADR-098 (the gateway admits http loopback origins that
Terraform cannot deploy).** The oversight marker was written while the body still carried, in
the present tense, a section headed "why this record is still `unconfirmed`" and a paragraph
saying that marking it confirmed would attest to a reading that had not happened. Confirming
the record falsified both. Five passages were falsified in all. The three below were not
noticed at the time:

1. An opening imperative telling the reader to "confirm, amend or reject" — offering the one
   operation ratification forecloses under ADR-049.
2. A second present-tense heading, "What this record asks of you".
3. The decisions compendium entry's `**Oversight:** unconfirmed` line. That sits on the
   architect agent's routine load surface per ADR-077, so it was the highest-traffic of the
   three, and the only one outside the record itself.

## Symptoms

1. **A ratified record asserts it is unratified**, in its own body and on the compendium, while
   the frontmatter marker says the opposite. A reader has no way to tell which is authoritative
   without knowing that ratification is the marker and not the status field.
2. **The repair is a prohibited-class edit.** Fixing it means editing a ratified record's body,
   which ADR-049 normally routes to a new decision instead.
3. **Silent rewriting is the likely outcome.** The cheap response is to quietly fix the tense
   and move on, which is exactly the label-instead-of-substance failure ADR-049's own
   reassessment criteria name.

## Workaround

Ask `wr-architect:agent` to adjudicate before touching the body, and apply the
retain-as-history shape from `DECISION-MANAGEMENT.md` — quote the superseded wording verbatim,
date it, say what replaced it, and state that no decision substance changed. That is what was
done here, and the retention note in the record carries it.

This is a workaround and not a fix: it costs an adjudication round per occurrence, and it only
works if the agent thinks to ask.

## Impact Assessment

- **Who is affected**: the maintainer, and any agent reading a ratified record to decide what
  the project has already settled.
- **Frequency**: once per ratification of any record written in the "here is what you have not
  yet seen" voice. Observed once, immediately, on the first record ratified after that voice
  was adopted.
- **Severity**: governance and audit trail. No service, billing or customer effect.
- **Analytics**: not applicable.

## Root Cause Analysis

**Why this is a class and not a one-off.** The voice that causes it is not a mistake — it is
what an honest unconfirmed record looks like, and the drain encourages it by asking the record
to say what the human has not yet seen. So the better the record, the more self-referential
status prose it carries, and the more the marker write falsifies. The defect scales with
quality, which is the wrong direction.

**Why nothing catches it.** The drain writes the marker into the frontmatter. No check reads
the body for statements about the record's own confirmation state, and no check reads the
compendium for the same. The three unnoticed passages here were found by a reviewer that was
asked a different question.

**Then this ticket reproduced the defect it names.** The first draft said "three further
passages" above a list whose second item read "two present-tense navigation headings" — four
by the list, three by the sentence, and five once the two already-noticed passages were added
back. The risk scorer caught it before the commit. Recorded rather than quietly fixed, because
a count restated in prose going stale is the same class this ticket exists to close, and
because it is evidence that the class is not rare.

**Why the sequencing rule cannot be satisfied as written.** A passage explaining why a record
is not yet confirmed is falsified by confirming it, necessarily, in every instance. If the
drain's "confirmation is the final content write" is taken literally, such a record can never
be ratified without permanently embedding a contradiction. The rule forbids repairing damage
its own mandated operation causes.

### Investigation Tasks

- [ ] Decide between the two candidate fixes, or find a third. **(a)** A pre-marker step in the
      drain that scans the record for present-tense statements about its own oversight state
      and for text offering amendment, refusing to write the marker until they are resolved.
      **(b)** Allow the confirmation write to carry a scoped body edit, which is the honest
      reading if the collision is unrepairable in order.
- [ ] Decide whether the compendium entry is in scope for the same sweep. It was the
      highest-traffic stale surface here and is a separate file from the record.
- [ ] Write the failing check first, whichever fix is chosen. A detector nothing runs is not a
      control, per ADR-051.
- [ ] Sweep the already-ratified records for the same residue. This was the first ratification
      in this voice, so the expected count is low, but "expected low" is not measured.

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: P102 — see Related.

## Related

Raised by `wr-architect:agent` during the ADR-098 ratification, which said explicitly that this
is a problem ticket rather than a new decision.

**P102 (the no-amendment directive conflicts with DECISION-MANAGEMENT.md)** is adjacent and
distinct. P102 asks _whether_ a ratified record may be amended at all — a standing directive
says no, the document says yes with retention, and both are live. This ticket asks _when_ the
marker should be written relative to the body, and observes that no sweep enforces the order.
P102's investigation tasks are discharged and it is ready to transition, so this was captured
as a sibling rather than hung off it. If P102's resolution lands the permission question one
way, this ticket's fix (a) or (b) choice narrows accordingly.

Hang-off pre-filter surfaced six candidates on shared `ADR-049` / `ADR-098` /
`DECISION-MANAGEMENT.md` signals, over the five-candidate cap, so the arbiter subagent was
skipped by contract. P102 was read directly rather than deferred. The other five —
P091, P093, P115, P127, P148 — share only an incidental ADR citation and none is a parent.

Title-only duplicate grep on `oversight|marker|ratif` matched five tickets, none of them this
problem: P046 and P121 are marker-mechanics defects (session id resolution, verdict consumed
at launch), P072 is the ISSUES-FOUND deadlock, P048 is external-comms hash exactness, and P111
is closed. Worth a glance at the next `/wr-itil:review-problems` in case P046 and this one
want merging under a single "the oversight marker's write is unguarded" parent.

**Evidence**: commits `a168036c` (the accessibility rewrite) and `d12f19ba` (the ratification
and the repair), both on master. ADR-098's own retention note records the out-of-order write in
the artefact itself. Cited by identifier rather than by path, because the path carries a
mutable lifecycle suffix and no check resolves a path inside a code span.
