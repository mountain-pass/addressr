# Problem 072: An ISSUES FOUND architect verdict writes no marker, deadlocking the ADR edits it asks for

**Status**: Open
**Reported**: 2026-07-30
**Priority**: 6 (Medium) — Impact: Moderate (3) × Likelihood: Likely (4). Impact 3: no user-facing or production effect, but it burns a large amount of session context and wall-clock on round-trips that produce no change, and the documented escape hatch is a manual marker override that weakens the gate it bypasses. Likelihood 4: observed repeatedly within a single session, and it fires by construction whenever an architect review of a decision record returns issues.
**Origin**: internal — surfaced 2026-07-29 while working P069/ADR-041.
**Effort**: M — the fix is upstream in `@windyroad/architect`'s hook, and the right shape needs thought (see Investigation Tasks).
**WSJF**: 3.0 — (6 × 1.0) / 2
**JTBD**: JTBD-001
**Persona**: addressr-maintainer

## Description

The `wr-architect` PreToolUse edit gate only unblocks on a verdict whose output leads with `**Architecture Review: PASS**`. An `ISSUES FOUND` verdict writes no marker.

That is correct for source files: issues found, do not proceed. But `docs/decisions/` is _in_ the gate's scope, so when the architect returns ISSUES FOUND **against an ADR itself**, the issues can only be fixed by editing that ADR — which the gate now blocks. The reviewer asks for changes to a file it has simultaneously made unwritable.

Observed on 2026-07-29 working ADR-041. The gate blocked an edit whose entire content was the corrections the immediately-preceding review had requested.

## Symptoms

`BLOCKED: Cannot edit '<adr>.proposed.md' without architecture review ... No architect review marker found for this session.` immediately after an architect review that named specific required changes to that file.

A second, milder shape compounds it: committing an ADR is itself decision-drift, so the marker is invalidated again on the next edit. Landing a reviewed ADR and then continuing to implement requires another review round purely to restore the marker, with no substantive question to answer.

## Workaround

Put the _exact pending edit text_ to the architect as a pre-edit review and ask for a verdict on the proposed wording, rather than asking it to re-review the current state. A PASS on the proposal writes the marker, and the edits can then be applied verbatim. This works, but it costs a full review round per correction pass and inverts the normal order (review-then-edit becomes propose-verbatim-then-edit).

The block text also documents a manual marker assertion (`touch /tmp/architect-reviewed-$SID && rm -f ...hash`), gated on already holding a genuine PASS. That was deliberately not used here: asserting a marker to escape a verdict that found real issues is exactly the discipline the gate exists to enforce.

## Impact Assessment

- **Who is affected**: any maintainer session that runs an architect review over a decision record and gets issues back. On this project that is the normal path, since ADRs are reviewed before ratification.
- **Frequency**: seven architect round-trips were needed to land one ADR and its amendments on 2026-07-29. At least two were pure marker-restoration with no new substance.
- **Severity**: Moderate — no wrong output reaches production, but it consumes a large share of a session's context budget, and the pressure it creates points toward the manual override, which is the outcome least aligned with the gate's purpose.

## Root Cause Analysis

### Hypothesis

The gate's scope and its unblock condition were designed for source files, where "issues found → stay blocked" is the right invariant. Decision records are in scope for good reasons (an ADR is a project file, and unreviewed decisions are exactly what the gate protects against), but they are also the _output_ of the review, so the same invariant produces a cycle.

The drift-invalidation rule compounds it independently: the marker keys on `docs/decisions/` content, so the act of landing a reviewed decision invalidates the review that approved it.

### Investigation Tasks

- [x] Confirm the deadlock is structural rather than a one-off — reproduced repeatedly on 2026-07-29 across ADR-041, ADR-027, ADR-021 and ADR-028 edits.
- [x] Confirm the pre-edit-proposal workaround clears it without weakening the gate.
- [ ] Decide the right shape upstream. Candidates: let an ISSUES FOUND verdict write a _scoped_ marker permitting edits only to the files the review named; exempt `docs/decisions/` from the gate on the grounds that the architect review is itself the control for that directory; or have the drift check ignore changes to decision files that the current session's review already covered.
- [ ] Check whether the same cycle exists on the JTBD gate for `docs/jtbd/` — that directory is excluded from the JTBD gate's scope, which suggests the exclusion approach is already precedent.
- [ ] Report upstream to `windyroad/agent-plugins` once the shape is agreed.

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none) — the workaround is sufficient to keep working.
- **Composes with**: P046 (`wr-architect` oversight-marker discipline blocks multi-agent confirms) — same marker mechanism, different failure. Worth fixing together.

## Related

- **P046** — sibling marker-discipline defect on the oversight path.
- **ADR-041** — the decision whose authoring surfaced this.
- `docs/briefing/what-will-surprise-you.md` — already records the marker-hash-exact family of traps; this is a new member of it.
