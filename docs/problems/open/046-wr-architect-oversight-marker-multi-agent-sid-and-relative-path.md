# Problem 046: wr-architect oversight-marker discipline blocks legitimate confirms in multi-agent sessions (relative-path hash + SID discovery)

**Status**: Open
**Reported**: 2026-07-08
**Priority**: 2 (Very Low) — Impact: Negligible (1) × Likelihood: Unlikely (2)
**Origin**: internal
**Effort**: M
**WSJF**: 1.0
**JTBD**: JTBD-001
**Persona**: developer

## Description

Writing `human-oversight: confirmed` into an ADR's frontmatter is gated by `architect-oversight-marker-discipline.sh` (PreToolUse:Edit|Write), which permits the edit only when `/tmp/oversight-confirmed-<sha256-first16-of-ABSOLUTE-path>-<session_id>` exists — `session_id` read from the hook's stdin, `sha` computed from the ADR's absolute path. The companion `wr-architect-mark-oversight-confirmed` command is meant to write that marker after an `AskUserQuestion` confirm lands. Two bugs make it fail in a multi-agent session:

1. **Relative-path hashing.** The mark command hashes the path argument **as given**. Passing a repo-relative path (`docs/decisions/029-...md`) produces a marker keyed by the relative-path hash, but the hook keys by the **absolute**-path hash — so the marker never matches and the edit stays BLOCKED even though the command printed success. Must always be invoked with an absolute path; the command should normalise internally.

2. **SID discovery misses the main session.** Even with an absolute path, the mark command writes the marker only under candidate session IDs it discovers by mtime-scanning `/tmp/*-announced-*` markers. In a multi-agent session (this one had architect + JTBD + risk-scorer subagents firing concurrently), those candidates are the subagents' SIDs; the hook reads the **main session's** `session_id` from its own stdin, which is not in the discovered set. Result: 21 markers written under the wrong SIDs, none matching, edit BLOCKED. Same root class as P043 (the wr-itil SID-helper picking a subagent UUID) but in a different plugin/helper.

Hit 2026-07-08 ratifying ADR 029 (two-phase blue/green upgrade) and ADR 031 (read-shadow warming). Recovered by hand-writing the marker for each candidate session UUID: `H=$(printf '%s' "$ABS_ADR_PATH" | shasum -a 256 | cut -c1-16); touch /tmp/oversight-confirmed-$H-<session-uuid>` (the session id is one of the UUIDs in the scratchpad / task-output paths), then retrying the Edit.

Upstream fix needed in `@windyroad/wr-architect`: (a) normalise the path arg to absolute before hashing; (b) resolve the current SID the same way the discipline hook does (from the authoritative runtime-sid file, matching the P124/P260 pattern the wr-itil side uses), or write the marker under every plausible SID including the one the hook will read.

## Symptoms

- The edit gate stays BLOCKED after a genuine review PASS, because the marker was written under a session ID that is not the one the hook reads.

### Recurrence evidence — 2026-07-25 (P035 investigation iter)

First observation of this failing on the **edit-gate** marker (`architect-reviewed-*`) rather than the oversight marker, and the first with concrete SID evidence. Both governance subagents wrote markers under **their own** session IDs, never the parent's:

- Parent session: `8acaaf59-b35f-44a3-9943-495e720e571b`. It had `/tmp/architect-announced-8acaaf59-…` (written at announce time, in-process) but **no** `/tmp/architect-reviewed-8acaaf59-…`.
- The `wr-architect:agent` subagents instead produced `/tmp/architect-reviewed-0c817bfd-…` and `/tmp/architect-reviewed-b9f9b263-…` — subagent SIDs, invisible to the parent's hook.
- Net effect: a fresh-spawn review whose output led with the exact literal `**Architecture Review: PASS**` still left the edit blocked. Cleared only via the manual escape the hook's own error message documents (`touch /tmp/architect-reviewed-$SID && rm -f …$SID.hash`).

This confirms investigation task 3 (the SID-discovery gap) for the edit-gate marker path: the marker writer runs in the subagent's process and stamps the subagent SID, while the `PreToolUse` hook resolves the _parent_ session from stdin. Any `Agent`-tool-mediated review therefore cannot satisfy the gate it exists to satisfy — the P400 note in the hook message ("must be a FRESH Agent spawn") is a workaround for a symptom, not the cause, and does not help because a fresh spawn has the same SID mismatch.

**Likelihood is under-rated.** The ticket carries Likelihood: Unlikely (2), but this fired on _both_ governance gates in a single routine iteration (architect and, transitively, the review round-trip for JTBD). Every `manage-problem` iteration that edits a gated file will hit it. Recommend re-rating at the next `/wr-itil:review-problems`.

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
- **Reported upstream**: https://github.com/windyroad/agent-plugins/issues/393 (2026-07-25)

## Reported Upstream

- **URL**: https://github.com/windyroad/agent-plugins/issues/393
- **Reported**: 2026-07-25
- **Template used**: problem-report.yml (problem-first shape, body composed per ADR-033 structured mapping)
- **Disclosure path**: public issue
- **Dedup verdict**: no match. The only nearby hit, windyroad/agent-plugins#364 ("create-adr does not delegate to architect/jtbd edit-gate agents before Write"), is a different defect in a different command — it is about which agents create-adr delegates to, not about the marker key the mark command writes.
- **Gates**: `wr-risk-scorer:external-comms` PASS; `wr-voice-tone:external-comms` PASS (rev 2 — rev 1 failed on em-dashes)
- **Cross-reference confirmed**: yes — the issue body's Cross-reference section names P046 and this repo's `docs/problems/` directory
- **Local status unchanged**: remains upstream-blocked. Reporting does not fix it locally.
