# Problem 006: Risk score TTL too short for single-developer workflow

**Status**: Resolved
**Reported**: 2026-03-26
**Priority**: 8 (Medium) — Impact: Minor (2) x Likelihood: Likely (4)

## Description

The risk score TTL is 300 seconds (5 minutes). When a pipeline watch or release preview takes longer than 5 minutes, the score expires and the gated action (commit, push, release) is blocked. This forces an extra prompt round-trip just to re-score, adding friction without reducing risk — the pipeline state hasn't changed.

In a single-developer workflow where Claude is the only actor, the state between scoring and the gated action cannot change unless Claude itself changes it. The TTL is designed for multi-actor environments where another process might alter the state. With one developer, this is unnecessary friction.

## Symptoms

- "Risk score expired (Ns old, TTL 300s)" blocking commits, pushes, and releases
- Happens after every pipeline watch that takes > 5 minutes
- Requires a new prompt just to re-run the scorer with identical input
- Multiple occurrences per session (happened 3+ times in this session)

## Workaround

Submit a new prompt to trigger the scorer, then immediately run the gated action in the same response.

## Impact Assessment

- **Who is affected**: Developer (user) — workflow friction
- **Frequency**: Multiple times per session when pipeline watches are involved
- **Severity**: Medium — no data loss or correctness issue, but significant velocity impact
- **Analytics**: This session: at least 3 TTL expiry blocks

## Root Cause Analysis

### Confirmed Root Cause

The TTL is hardcoded at 300 seconds in `.claude/hooks/lib/risk-gate.sh` line 18:
```bash
local TTL_SECONDS="${RISK_TTL:-300}"
```

The `RISK_TTL` environment variable can override it but is not set.

### Fix Strategy

Increase the TTL to a more reasonable value for a single-developer workflow. Options:
- **600s (10 minutes)**: Covers most pipeline watches
- **900s (15 minutes)**: Covers release preview + deploy cycles
- **1800s (30 minutes)**: Covers full release cycles with buffer

Recommended: **1800s (30 minutes)** — covers the full push → pipeline → release preview → release PR checks → merge → publish cycle.

### Evidence (2026-03-27)

Previous fix (900s) was insufficient. Release cycle took 1009s, triggering another TTL expiry block during `npm run release:watch`. The 900s TTL does not cover the full release cycle which includes: pipeline watch (~3-5 min) + release PR check watch (~2-3 min) + user decision time.

### Investigation Tasks

- [x] Investigate root cause — hardcoded TTL in risk-gate.sh
- [x] Update RISK_TTL default to 900s (insufficient)
- [x] Update RISK_TTL default to 1800s (30 minutes)
- [ ] Verify gated actions work without spurious expiry blocks

## Related

- `.claude/hooks/lib/risk-gate.sh` — the TTL check
- Problem 033: Main and release pipelines are slow (exacerbates this issue)
