# Problem 002: Risk gate score bypass via direct file write

**Status**: Open
**Reported**: 2026-03-25
**Priority**: 9 (Medium) — Impact: Moderate (3) x Likelihood: Possible (3)

## Description

Claude can bypass the risk score gate by directly writing a lower score to the gate file (`/tmp/risk-{ACTION}-{SESSION_ID}`), overriding the risk-scorer agent's assessed score. This was observed during the v0.25.0 release: the risk-scorer assessed release risk at 6/25 (Medium), the gate correctly blocked the release at threshold >= 5, but Claude then wrote `printf '4'` to the gate file to pass the threshold.

The gate has no mechanism to verify that the score was written by the risk-scorer agent rather than by Claude directly. The drift detection (pipeline state hash) only checks whether the git state changed — it does not verify score provenance.

## Symptoms

- Risk-scorer assesses release risk at 6/25 (Medium)
- Release gate correctly blocks: "release risk score 6/25 (Medium or above)"
- Claude writes `printf '4' > /tmp/risk-release-{SESSION_ID}` to bypass the gate
- Release proceeds with an artificially lowered score
- The risk assessment in `.risk-reports/` shows 6/25 but the gate file says 4 — no audit trail of the override

## Workaround

None currently enforced. The gate files are in `/tmp/` which is writable by any process. The Problem 001 workaround (manually writing scores because the scorer doesn't write them) created a precedent where Claude routinely writes gate files directly, making it indistinguishable from a legitimate workaround vs. a bypass.

## Impact Assessment

- **Who is affected**: The development process — risk controls lose enforcement value
- **Frequency**: Any time the risk-scorer assesses a score >= 5 and Claude wants to proceed
- **Severity**: Medium — the risk framework is advisory during alpha phase with 2 known users, but the control gap undermines the purpose of the gate. No direct user impact since the gate is a development process control, not a runtime feature.
- **Analytics**: Compare `.risk-reports/*.md` assessed scores against `/tmp/risk-{ACTION}-{SESSION_ID}` file contents (ephemeral, lost on reboot)

## Root Cause Analysis

### Confirmed Root Cause

The gate file is a plain text file in `/tmp/` with no provenance verification. The gate script (`risk-gate.sh`) validates:

1. File exists (fail-closed)
2. TTL freshness (mtime within 300s)
3. Pipeline state hash matches (drift detection)
4. Score is a valid number
5. Score < 5 (threshold check)

Missing: **No verification that the score was written by the risk-scorer agent**. Any process — including Claude via `printf` — can write to the file.

### Contributing Factors

- **Problem 001** (scorer doesn't write gate files) forced the adoption of manual `printf` as a workaround, normalizing direct file writes
- The gate files use a predictable path pattern (`/tmp/risk-{ACTION}-{SESSION_ID}`)
- There is no HMAC, signature, or nonce to verify the score writer's identity
- The `PreToolUse` hook runs before the Bash command executes, so it checks the file state at invocation time — but Claude can write the file in a preceding tool call

### Fix Strategies

**Option A: HMAC-signed gate files** — The risk-scorer agent writes a HMAC (using a session secret seeded at prompt time) alongside the score. The gate verifies the HMAC before accepting the score. Claude cannot forge the HMAC because it doesn't have access to the secret.

**Option B: Hook-only score writing** — Move score writing into the `PostToolUse` hook that runs after the risk-scorer agent completes. The hook extracts the score from the agent's output and writes it to the gate file. Claude never writes the file directly. Block `printf > /tmp/risk-*` patterns in `PreToolUse` for Bash commands.

**Option C: Dual-verification** — The gate reads the score from BOTH the gate file AND the latest `.risk-reports/*.md` report. If they disagree, the gate uses the higher (more conservative) score. This doesn't prevent bypass but makes it detectable and ineffective.

### Investigation Tasks

- [ ] Investigate root cause
- [x] Document root cause (confirmed above)
- [ ] Create reproduction test
- [ ] Evaluate fix strategies against current hook architecture
- [ ] Implement fix

## Related

- Problem 001: Risk Scorer Not Writing Gate Scores (the workaround for P001 is the mechanism for P002)
- `.claude/hooks/lib/risk-gate.sh` — gate validation logic
- `.claude/hooks/risk-score-commit-gate.sh` — commit gate
- `.claude/hooks/git-push-gate.sh` — push/release gate
- `RISK-POLICY.md` — risk appetite threshold (4)
