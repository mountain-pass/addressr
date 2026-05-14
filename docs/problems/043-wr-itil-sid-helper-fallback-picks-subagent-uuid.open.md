# Problem 043: `wr-itil` session-ID helper fallback picks subagent UUID in multi-agent sessions

**Status**: Open
**Reported**: 2026-05-14
**Priority**: 3 (Medium) — Impact: 3 x Likelihood: 1 (deferred — re-rate at next /wr-itil:review-problems)
**Effort**: M (deferred — re-rate at next /wr-itil:review-problems)
**Type**: technical

## Description

The `wr-itil` create-gate hook (`packages/itil/hooks/manage-problem-enforce-create.sh`, P119) denies new-ticket Writes under `docs/problems/` when the per-session marker `/tmp/manage-problem-grep-${SESSION_ID}` is absent for the SID the hook reads from its stdin JSON payload. The marker is supposed to be written by the agent calling `mark_step2_complete "$sid"` after the duplicate-grep in capture-problem / manage-problem Step 2, with `$sid` discovered via `get_current_session_id` (P124 helper).

In a multi-agent session — this one had architect, JTBD, and risk-scorer subagents firing concurrently — the helper returned a SUBAGENT's SID rather than the main session's SID. The marker was written under the subagent's UUID; the hook (running under the main session's SID) couldn't find it, and the Write was denied.

Specific reproduction during the P040 work session on 2026-05-14:

1. Main session SID (per `/tmp/itil-runtime-sid-tomhoward-3165484195.current` where `3165484195 = cksum(PWD)`): `66200a99-9c1b-48c5-b8bf-e83c9300eb71`
2. Helper-returned SID: `2092dc01-e781-4e4a-b79f-7b513477503b` (this matched an architect subagent's announce marker)
3. Marker written at: `/tmp/manage-problem-grep-2092dc01-...`
4. Hook expected marker at: `/tmp/manage-problem-grep-66200a99-...`
5. Result: P042 Write was denied; recovery required diagnostic + manual marker write under the runtime-marker-derived SID.

## Symptoms

- `BLOCKED: Cannot Write '<NNN>-<title>.open.md' under docs/problems/ without running /wr-itil:manage-problem Step 2 (duplicate-check) first.` deny message, even though Step 2 just ran in the same Bash invocation.
- `/tmp/manage-problem-grep-${SID}` exists, but the SID does not match `/tmp/itil-runtime-sid-${USER}-$(cksum<<<$PWD).current`.
- Helper-returned SID matches a recent subagent's announce marker (architect, JTBD, etc.).

## Root cause analysis (suspected — needs upstream confirmation)

`get_current_session_id` in `packages/itil/hooks/lib/session-id.sh` has a documented priority order (P142 / ADR-050):

1. `CLAUDE_SESSION_ID` env var (not exported by Claude Code today)
2. Runtime-SID marker at `/tmp/itil-runtime-sid-${USER}-${proj_hash}.current` (where `proj_hash = cksum($PWD)`)
3. Cold-path fallback: mtime-sort `/tmp/${system}-announced-${SID}` across architect / jtbd / tdd / itil-assistant-gate / itil-correction-detect / style-guide / voice-tone

The bug appears to be in path #2's fail-condition: when the runtime-SID marker exists but is empty (the PreToolUse:Bash hook hasn't yet flushed its write before the helper reads it — possible on the FIRST tool call after spawning), `[ -s "$rt_path" ]` returns false and the helper falls through to path #3. Path #3's "newest mtime" heuristic then picks whichever announce marker was most recently touched — in this session, subagents had been firing rapidly and their announce markers were newer than the main session's.

The architect's commentary on the helper (path #3 docstring) acknowledges this exact failure mode at P124 Phase 2 ("returns the lexically-first stale UUID when /tmp had accumulated markers from prior sessions — observed regression 2026-04-28") and fixes it via mtime-sort. But mtime-sort produces a DIFFERENT failure mode in the multi-agent case described here: the newest-mtime marker is a live SUBAGENT's, not the live MAIN session's. The Phase 4 runtime-marker fix (P142 / ADR-050) was supposed to obviate the announce-marker fallback in the routine case, but does not catch the cold-path / empty-runtime-marker case.

## Workaround

```bash
real_sid=$(cat "/tmp/itil-runtime-sid-${USER:-$(whoami)}-$(printf '%s' "$PWD" | cksum | awk '{print $1}').current" 2>/dev/null)
[ -n "$real_sid" ] && : > "/tmp/manage-problem-grep-${real_sid}"
```

Then retry the Write. The runtime-SID marker is the authoritative source — read directly, write the gate marker under its content.

## Impact Assessment

- **Who is affected**: Addressr Contributor/Maintainer (operator) persona — any user invoking `/wr-itil:manage-problem` or `/wr-itil:capture-problem` in a session that has running subagents (extremely common with the architect / JTBD / voice-tone / risk-scorer gates this project carries).
- **Frequency**: Realised once in the P040 session (capture of P042). Likely to recur for any new-ticket creation in a multi-agent session — happens once per such session unless the runtime-SID marker is non-empty by the time Step 2's mark fires.
- **Severity**: (deferred to investigation — diagnostic friction, not service-affecting)
- **Analytics**: Session transcript 2026-05-14, capture of P042; `/tmp/itil-runtime-sid-*` + `/tmp/*-announced-*` marker inventory at the time.

## Fix Strategy

Type: `improve` — targeted edit to an existing skill / hook lib in upstream `@windyroad/itil`.

- **Target file**: `packages/itil/hooks/lib/session-id.sh` in upstream `@windyroad/itil` (currently in plugin cache at `0.27.1`).
- **Observed flaw**: cold-path fallback to mtime-sort across announce markers picks subagent UUIDs in multi-agent sessions, when the runtime-SID marker hasn't yet been populated.
- **Edit summary** (suggested — needs upstream architect verdict):
  1. When the runtime-SID marker exists but is empty (vs absent), retry-with-short-sleep (e.g. 50ms × 3) before falling through. The empty state is transient — a PreToolUse hook is mid-write or queued.
  2. Filter announce markers to those that match a process-tree heuristic for "this agent's session" — e.g. read `/proc/$$/status` or `ps -o ppid` to identify the parent process and prefer markers whose creating process is in the same tree. This is more involved.
  3. Alternative: change the create-gate hook to read the runtime-SID marker as its authoritative source (matching what the helper SHOULD return) and reconcile against the stdin `session_id` — when they mismatch in a benign way (mid-write race), accept.
- **Evidence**: this session's P042 capture failure + the diagnostic trace recorded above.
- **Routing**: upstream report via `/wr-itil:report-upstream` to `mountain-pass/windyroad` (or wherever `@windyroad/itil` source lives). Local ticket is the audit trail.

## Dependencies

- **Blocks**: (none — workaround is one bash line)
- **Blocked by**: (none — upstream fix is local to `@windyroad/itil`)
- **Composes with**: (none currently noted; possibly related to P119 hook + P124 helper + P142 runtime-SID landing in upstream)

## Related

- **BRIEFING.md** (this session added an entry naming the workaround under "What Will Surprise You").
- **`@windyroad/itil` plugin** — `packages/itil/hooks/lib/session-id.sh` (P124 helper), `packages/itil/hooks/manage-problem-enforce-create.sh` (P119 hook), `packages/itil/hooks/itil-runtime-sid-marker.sh` (P142 / ADR-050 runtime marker).
- P040 work session, 2026-05-14 — capture of P042 failed initially; manual recovery applied per the Workaround block.

(captured via /wr-itil:capture-problem; expand at next investigation)
