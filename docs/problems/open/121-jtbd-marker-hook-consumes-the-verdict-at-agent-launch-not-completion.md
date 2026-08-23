# Problem 121: The JTBD marker hook consumes the verdict when the agent is launched, not when it finishes

**Status**: Open
**Reported**: 2026-08-23
**Priority**: 12 (High) — Impact: Moderate (3) × Likelihood: Likely (4). Impact 3: the failure is bidirectional. It denies edits after a genuine PASS, which is merely obstructive; it also **opens the gate on a review that never examined the file being edited**, which is a governance control reporting coverage it does not have — the P106 / ADR-051 class. Not 4, because the gate guards documentation alignment rather than production behaviour. Likelihood 4: it fires whenever a subagent runs in the background, which is the default in this harness, and it fired three times in one session on 2026-08-23.
**Origin**: internal
**Effort**: M — the fix is a marker write by the agent itself, or a session-scoped verdict path the hook polls on completion. M rather than S because the code lives in the wr-jtbd plugin, outside this repo, so it carries an upstream round trip.
**WSJF**: 6.0 — (12 × 1.0) / 2
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

`jtbd-mark-reviewed.sh` is a `PostToolUse` hook on the `Agent` matcher. It reads `/tmp/jtbd-verdict`,
`rm -f`s it, and writes `/tmp/jtbd-reviewed-${SESSION_ID}` when the verdict is `PASS`.

That contract assumes the `Agent` tool returns **after** the subagent has finished. In this harness
subagents run in the background: the tool call returns immediately with "Async agent launched
successfully", and the review completes minutes later. So `PostToolUse` fires at **launch**, and reads
whatever verdict the _previous_ review left behind.

The gate is therefore **off by one review**.

## Evidence

Observed directly on 2026-08-23 while writing ADR-053, in this order:

1. First `wr-jtbd:agent` review of the proposal returned FAIL. No marker written — correct.
2. Second review, of `docs/decisions/053-*.proposed.md`, returned **PASS** and wrote it to
   `/tmp/jtbd-verdict` at 12:57. **No marker appeared**, and the `Write` was denied.
3. `/tmp/jtbd-verdict` still contained `PASS`, unconsumed — proving the hook had not run after the agent
   finished. Had it run, it would have deleted the file.
4. Launching a third review caused `/tmp/jtbd-reviewed-bf80f9a4-…` to appear **at 12:58, the same second as
   the launch**, before the third review had done any work. The verdict file was consumed. The marker was
   written by the second review's verdict, delivered by the third review's launch.

Two independent defects compose here:

- **The off-by-one above.** A FAIL is cleared by launching any subsequent agent after a PASS, and a PASS
  from a review of file A opens the gate for an unrelated edit to file B.
- **`/tmp/jtbd-verdict` is a single global path with no session scoping**, while the marker it produces
  _is_ session-scoped (`/tmp/jtbd-reviewed-${SESSION_ID}`). Concurrent Claude sessions on one machine
  share the verdict file. At 12:54 a different session's marker was written in the same minute this
  session's verdict was overwritten. So one session's PASS can open another session's gate.

## Investigation Tasks

- [ ] Confirm the same shape in the sibling gates. `wr-architect` and `wr-voice-tone` use the same
      marker-and-verdict pattern; if they share the launch-time assumption they share the defect. Do not
      assume they do — check.
- [ ] Decide the fix shape. Two candidates: have the reviewing agent write the session-scoped marker itself
      as its final action, removing the hook from the timing path entirely; or scope the verdict to
      `/tmp/jtbd-verdict-${SESSION_ID}` and have the hook consume it on a completion signal rather than a
      launch signal. The first is smaller and removes both defects at once.
- [ ] Bind the verdict to the file it reviewed. Even correctly timed, a bare PASS attests to a review of
      _something_. A marker carrying the reviewed path would make the gate mean what it appears to mean.
- [ ] Mutation-test whichever fix lands, in both directions: a FAIL must still deny after an unrelated agent
      runs, and a PASS for file A must not open the gate for file B.

## Notes

Not hypothetical and not worked around by forging a marker: the marker that eventually opened the gate for
ADR-053 was produced by a real PASS from a real review of that exact file. The verdict was sound; only its
delivery was broken. That is precisely what makes the defect easy to miss — it mostly looks like flakiness,
and the dangerous direction looks like success.

## Related

[P072](072-architect-issues-found-writes-no-marker-deadlocking-adr-edits.md) — _Architect ISSUES FOUND
writes no marker, deadlocking ADR edits_. Same family, different mechanism, and worth fixing together. P072
is about a verdict that **correctly** withholds the marker and leaves no route forward; this ticket is about
a verdict that reaches the hook **one review late** regardless of its content. A fix for either that moves
the marker write into the reviewing agent would resolve both.
