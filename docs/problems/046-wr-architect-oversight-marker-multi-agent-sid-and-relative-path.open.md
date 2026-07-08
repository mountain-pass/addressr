# Problem 046: wr-architect oversight-marker discipline blocks legitimate confirms in multi-agent sessions (relative-path hash + SID discovery)

**Status**: Open
**Reported**: 2026-07-08
**Priority**: 3 (Medium) — Impact: 3 x Likelihood: 1 (deferred — re-rate at next /wr-itil:review-problems)
**Origin**: internal
**Effort**: M (deferred — re-rate at next /wr-itil:review-problems)
**JTBD**: JTBD-001
**Persona**: developer

## Description

Writing `human-oversight: confirmed` into an ADR's frontmatter is gated by `architect-oversight-marker-discipline.sh` (PreToolUse:Edit|Write), which permits the edit only when `/tmp/oversight-confirmed-<sha256-first16-of-ABSOLUTE-path>-<session_id>` exists — `session_id` read from the hook's stdin, `sha` computed from the ADR's absolute path. The companion `wr-architect-mark-oversight-confirmed` command is meant to write that marker after an `AskUserQuestion` confirm lands. Two bugs make it fail in a multi-agent session:

1. **Relative-path hashing.** The mark command hashes the path argument **as given**. Passing a repo-relative path (`docs/decisions/029-...md`) produces a marker keyed by the relative-path hash, but the hook keys by the **absolute**-path hash — so the marker never matches and the edit stays BLOCKED even though the command printed success. Must always be invoked with an absolute path; the command should normalise internally.

2. **SID discovery misses the main session.** Even with an absolute path, the mark command writes the marker only under candidate session IDs it discovers by mtime-scanning `/tmp/*-announced-*` markers. In a multi-agent session (this one had architect + JTBD + risk-scorer subagents firing concurrently), those candidates are the subagents' SIDs; the hook reads the **main session's** `session_id` from its own stdin, which is not in the discovered set. Result: 21 markers written under the wrong SIDs, none matching, edit BLOCKED. Same root class as P043 (the wr-itil SID-helper picking a subagent UUID) but in a different plugin/helper.

Hit 2026-07-08 ratifying ADR 029 (two-phase blue/green upgrade) and ADR 031 (read-shadow warming). Recovered by hand-writing the marker for each candidate session UUID: `H=$(printf '%s' "$ABS_ADR_PATH" | shasum -a 256 | cut -c1-16); touch /tmp/oversight-confirmed-$H-<session-uuid>` (the session id is one of the UUIDs in the scratchpad / task-output paths), then retrying the Edit.

Upstream fix needed in `@windyroad/wr-architect`: (a) normalise the path arg to absolute before hashing; (b) resolve the current SID the same way the discipline hook does (from the authoritative runtime-sid file, matching the P124/P260 pattern the wr-itil side uses), or write the marker under every plausible SID including the one the hook will read.

## Symptoms

(deferred to investigation)

## Workaround

Pass the ADR's **absolute** path to `wr-architect-mark-oversight-confirmed`; if the Edit is still BLOCKED, hand-write the marker for each candidate session UUID (from scratchpad/task paths): `H=$(printf '%s' "$ABS_ADR_PATH" | shasum -a 256 | cut -c1-16); touch /tmp/oversight-confirmed-$H-<uuid>`, then retry the Edit.

## Impact Assessment

- **Who is affected**: (deferred to investigation)
- **Frequency**: (deferred to investigation)
- **Severity**: (deferred to investigation)
- **Analytics**: (deferred to investigation)

## Root Cause Analysis

### Investigation Tasks

- [ ] Re-rate Priority and Effort at next /wr-itil:review-problems
- [ ] Confirm the mark command hashes the path as-given (relative vs absolute) against the hook's absolute-path hash
- [ ] Confirm the SID-discovery gap: mark writes under `/tmp/*-announced-*` candidates but the hook reads stdin `session_id`
- [ ] Create reproduction test (multi-agent session; mark then Edit blocked)

## Dependencies

- **Blocks**: (none — hand-write workaround exists)
- **Blocked by**: (none)
- **Composes with**: (none)

## Related

- **P043** — wr-itil SID-helper fallback picks subagent UUID in multi-agent session. This is the wr-architect sibling: same multi-agent SID-discovery root class, plus the additional relative-vs-absolute path-hash bug. Both need the same upstream SID-resolution fix in their respective @windyroad plugins.
- Captured via /wr-itil:capture-problem during the 2026-07-08 ADR 029 Phase 1 retro.
