# Problem 053: wr-risk-scorer scorer defers to RISK-POLICY.md prose over the gate numeric at the appetite boundary

**Status**: Known Error
**Reported**: 2026-07-18
**Priority**: 4 (Low) — Impact: 2 (Minor — false STOP at the boundary is friction, no wrong outcome; the gate is correct) × Likelihood: 2 (Unlikely — only when a change scores exactly the threshold value) — derived at capture
**Origin**: internal (pipeline-instability / upstream plugin friction)
**Effort**: M — derived at capture (upstream fix in the wr-risk-scorer plugin: scorer + update-policy)
**WSJF**: 4.0 — (4 × 2.0) / 2 (Known Error transition 2026-07-19 review: root cause confirmed 2026-07-18; prose-wording workaround documented)
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

The `wr-risk-scorer:pipeline` agent derives its appetite verdict from the RISK-POLICY.md § Risk Appetite prose, but the enforced gate (`hooks/lib/risk-gate.sh`) uses a strictly numeric `score > N` (N parsed from the `Threshold: N` line). When an adopter policy phrases the appetite as "residual risk score of N or above require remediation", the scorer reads it as "N blocks" and returns STOP at exactly N, while the gate passes N (N is not strictly greater than N). The scorer and gate — both shipped in the same plugin — disagree at the boundary value. Discovered while resolving P047 (closed): rewording addressr's RISK-POLICY.md prose from "5 or above" to "above 5" flipped the scorer from STOP to CONTINUE at a residual of 5, confirming the verdict is prose-driven, not gate-driven.

## Symptoms

- A change scoring exactly N gets a STOP verdict from the scorer but passes the commit/push gate (`score > N` is false at N).
- Operators escalate an in-appetite action or fire an unnecessary confirmation on a false "above appetite" premise.

## Workaround

Word the adopter RISK-POLICY.md § Risk Appetite as "above N" / "N+1 or above", never "N or above", so the prose matches the gate numeric. Local-only; the divergence is upstream.

## Impact Assessment

- **Who is affected**: addressr-maintainer (and any wr-risk-scorer adopter whose policy phrases appetite as "N or above")
- **Frequency**: any change scoring exactly the threshold value N
- **Severity**: low — friction + false STOP, not a wrong outcome (the enforced gate is correct)
- **Analytics**: N/A

## Root Cause Analysis

**Confirmed 2026-07-18.** The gate `hooks/lib/risk-gate.sh` denies when `score > N`. The scorer agent `pipeline.md` default framing is "within appetite = residual ≤ threshold" but it defers to explicit RISK-POLICY.md prose. Upstream fix: (a) scorer interprets `Threshold: N` numerically consistent with the gate regardless of prose; and/or (b) update-policy generates unambiguous "above N" prose and never "N or above".

### Investigation Tasks

- [x] Confirm scorer-vs-gate boundary divergence — done (P047 resolution; live at-threshold runs before/after the prose reword)

## Dependencies

- **Blocks**: (none)
- **Blocked by**: upstream — fix lives in the `wr-risk-scorer` plugin, not this repo

## Related

- Discovered during the P047 (closed) verification + fix, 2026-07-18.
- **Reported upstream**: https://github.com/windyroad/agent-plugins/issues/365 (2026-07-18)

## Reported Upstream

- **URL**: https://github.com/windyroad/agent-plugins/issues/365
- **Reported**: 2026-07-18
- **Template used**: problem-report.yml (problem-shaped structured body)
- **Disclosure path**: public issue
- **Cross-reference confirmed**: yes (issue body records the P053 downstream reference)
