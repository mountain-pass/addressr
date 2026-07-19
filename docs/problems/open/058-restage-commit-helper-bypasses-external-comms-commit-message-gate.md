# Problem 058: `wr-risk-scorer-restage-commit` commits bypass the git-commit-message external-comms gate

**Status**: Open
**Reported**: 2026-07-19
**Priority**: 6 (Medium) — Impact: Moderate (3 — confidential-info disclosure class if realised, cf. R011) × Likelihood: Unlikely (2 — bypass fires on every helper commit, but harm needs a leaking message AND the pipeline scorer missing it)
**Origin**: internal
**Effort**: M — derived at capture (fix is an upstream surface-regex extension + tests in `@windyroad/risk-scorer`; addressr-side marginal work is upstream report + workaround discipline)
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

The external-comms PreToolUse gate (P082 Phase 1) detects the `git-commit-message` surface by matching the Bash command against the literal pattern `(^|;|&&|\|\|)\s*git commit(\s|$)` (`external-comms-gate.sh`, installed `@windyroad/risk-scorer` v0.17.0). The `wr-risk-scorer-restage-commit` helper (P326, mandated by `/wr-itil:manage-problem` Step 11 step 3 for ALL commit-gate commits) runs `git commit` INSIDE its script body, so the observed Bash command never matches the surface regex and the gate exits as not-a-surface — the commit message skips the confidential-leak + credibility review entirely.

Every AFK work-problems iter commit uses the helper, so the designed leak control is silently inert on precisely the commit-message class it was built for (P082). Fix belongs upstream in `@windyroad/risk-scorer`: either extend the gate's surface-detection to match `wr-risk-scorer-restage-commit -m` forms, or make the helper compose through the gate/marker contract.

## Symptoms

- Commit e0448ff (2026-07-19, message referencing an upstream repo + issue number) landed via the helper with zero external-comms review round-trips.
- P048 documents the same gate forcing 3-4 re-review round-trips on 2026-07-14 bare `git commit -m` invocations in this repo — the gate is active; only the helper-wrapped form evades it.

## Workaround

Manually run `wr-risk-scorer:external-comms` on the final message before helper commits, or use bare `git commit -m` when the message carries anything external-facing. The `wr-risk-scorer:pipeline` commit scorer partially compensates (it reviews staged content for disclosure) but is not the per-message external-comms verdict agent.

## Impact Assessment

- **Who is affected**: addressr-maintainer (and any adopter repo committing via the P326 helper on a public repo)
- **Frequency**: every commit landed via `wr-risk-scorer-restage-commit` — the mandated path for all manage-problem commits
- **Severity**: Medium — a designed leak-prevention control is silently bypassed; realised harm requires a confidential figure in a commit message that the pipeline scorer also misses
- **Analytics**: N/A

## Root Cause Analysis

Confirmed at source 2026-07-19 (installed plugin v0.17.0): `external-comms-gate.sh` classifies the `git-commit-message` surface only when the Bash command string matches `(^|;|&&|\|\|)\s*git commit(\s|$)`. A command of the form `wr-risk-scorer-restage-commit -m "..." -- <paths>` contains no `git commit` token at the tool-call layer, so surface detection falls through and the hook exits 0 (not-a-surface). Hooks fire on tool calls, not nested shell invocations, so the helper-internal `git commit` is invisible to the PreToolUse gate.

### Investigation Tasks

- [x] Investigate root cause — confirmed at hook source (see above)
- [ ] Report upstream to windyroad/agent-plugins (`@windyroad/risk-scorer`)
- [ ] Create reproduction test — belongs upstream alongside the fix (`hooks/test/external-comms-gate.bats`)

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: P048 (external-comms marker hash-exactness, parked upstream-blocked — same gate, opposite failure polarity: P048 is false-positive re-block friction, this is false-negative bypass)

## Related

- Captured via `/wr-itil:capture-problem` during the P048 park iter retro (2026-07-19).
- Hang-off-check verdict: PROCEED_NEW — sole candidate P043 (`wr-itil` SID-helper fallback picks subagent UUID) has a distinct root cause and fix locus (`@windyroad/itil` session-ID race, false-positive deny) vs this ticket's `@windyroad/risk-scorer` surface-regex gap (false-negative pass); only shared signal is a `/wr-itil:manage-problem` reference on different steps. If a common "helper-wrapped commands evade command-surface regex gates" parent emerges, cluster at a later `/wr-itil:review-problems` pass.
- Duplicate-check filename matches (not duplicates): P016 (external comms posted without voice/tone check, parked), P048 (marker hash-exactness, parked).
- `~/.claude/plugins/cache/windyroad/wr-risk-scorer/0.17.0/hooks/external-comms-gate.sh` — surface-detection regex.
- P326 (upstream) — the `wr-risk-scorer-restage-commit` helper this gate never sees.
