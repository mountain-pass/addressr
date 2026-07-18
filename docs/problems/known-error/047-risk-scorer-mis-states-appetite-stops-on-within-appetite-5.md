# Problem 047: wr-risk-scorer:pipeline mis-states appetite and STOPs on a within-appetite score of 5

**Status**: Known Error
**Reported**: 2026-07-15
**Transitioned to Known Error**: 2026-07-15 (review — confirmed root cause + documented workaround)
**Priority**: 2 (Very Low) — Impact: Negligible (1) × Likelihood: Unlikely (2)
**Origin**: internal (pipeline-instability / subagent-delegation friction)
**Effort**: S
**WSJF**: 4.0

## Description

The `wr-risk-scorer:pipeline` agent phrases the risk appetite as "above appetite (>4)" and returns a STOP verdict on a residual score of **5**, contradicting the actual enforced gate. `RISK-POLICY.md` sets `Threshold: 5` and `risk-gate.sh` (`lib/risk-gate.sh` ~line 141) denies a commit/push only when `score > 5` — so a residual of **5 PASSES** the gate and is within appetite.

During the 2026-07-14 v2 (`addressr4`/2.19) decommission, the scorer scored the destroy 5/25 and framed it as an above-appetite STOP. The main agent took that at face value and escalated to the user with an unnecessary `AskUserQuestion` (keep-the-rollback-net vs destroy-now) built on the false "above appetite" premise. The user corrected: _"I thought our risk appetite was 5."_ The commit gate then confirmed it — the 5/25 commit passed without any bypass.

## Symptoms

- Scorer output says "above the appetite of 5" / "(>4)" / "STOP" for a residual of exactly 5.
- Main agent escalates a within-appetite action (bypass hunt, or a lazy `AskUserQuestion`), producing an ask-hygiene regression (1 lazy ask this session, docs/retros/2026-07-15-ask-hygiene.md call #4).
- The commit gate itself then passes the 5 with no bypass, exposing the scorer↔gate contradiction.

## Workaround

Trust the enforced gate, not the scorer prose. A residual of 5 is within appetite — do not escalate, do not seek a bypass, do not fire an `AskUserQuestion` on appetite grounds. Only 6+ blocks. Captured in `docs/BRIEFING.md` "What Will Surprise You" and memory `feedback_risk_appetite_is_5_inclusive.md`.

## Impact Assessment

- **Who is affected**: any operator whose change scores exactly 5 (the threshold value); recurs on every at-threshold pipeline action.
- **Frequency**: once this session; structurally recurs whenever a residual lands on 5.
- **Severity**: low — misdirected effort + a lazy ask, not a wrong outcome (the gate is correct).

## Root Cause Analysis

Upstream (`wr-risk-scorer` plugin) prose computes "above appetite" as `score > threshold - 1` (i.e. `≥ threshold`) rather than `score > threshold`. The enforcement (`risk-gate.sh`) uses `score > threshold`. Prose and code disagree at the boundary value.

### Investigation Tasks

**Live at-threshold verification 2026-07-18 (wr-risk-scorer 0.17.0): NOT fixed — reproduces, and deeper than first scoped.** A static-read of the agent prose (`≤ the appetite threshold`) initially looked fixed, but a live pipeline-scorer run on a residual of exactly 5/25 returned **STOP** — the scorer followed RISK-POLICY.md § Risk Appetite prose ("residual risk score of **5 or above** require remediation") and blocked 5. Meanwhile the enforced gate `hooks/lib/risk-gate.sh` computes `'yes' if score > N` (N parsed from `Threshold: 5`), so `5 > 5` is false and **5 PASSES the gate**. The scorer↔gate contradiction the ticket describes therefore persists (scorer STOPs at 5; gate passes 5).

**Newly surfaced (2026-07-18): RISK-POLICY.md is internally inconsistent at the boundary.** The `Threshold: 5` line (parsed by the gate as strict `> 5`, so 5 passes) and the prose "5 or above require remediation" (reads as `>= 5`, so 5 blocks) disagree. The scorer follows the prose; the gate follows the line. Resolving P047 requires a user decision on the intended appetite semantics: does residual 5 PASS (align the prose to the gate — reword to "above 5" / "6 or above"; matches memory `feedback_risk_appetite_is_5_inclusive.md`) or BLOCK (align the gate to the prose — change `> N` to `>= N`)? Once decided: (a) fix the ambiguous artefact, and (b) report the scorer↔gate contradiction upstream so both surfaces agree.

- [x] Confirm the scorer agent prose / template — **done, but the finding reversed the fix claim**: the 0.17.0 scorer follows the RISK-POLICY.md "5 or above" prose and STOPs at 5, contradicting the gate's `score > 5`. Verification date 2026-07-18.
- [ ] Align the scorer's "above appetite" definition with `risk-gate.sh` (`score > threshold`, threshold parsed from RISK-POLICY.md)
- [ ] Re-rate Priority and Effort at next review

## Dependencies

- **Blocks**: (none)
- **Blocked by**: upstream — fix lives in the `wr-risk-scorer` plugin, not this repo

## Related

- Captured via session retrospective 2026-07-15 (OpenSearch 3.5 migration).
- `docs/BRIEFING.md` "What Will Surprise You" — risk-gate caveat.
- Memory `feedback_risk_appetite_is_5_inclusive.md`.
- Sibling tooling-friction tickets: P004 (release:watch false negative), P005 (TDD hook Cucumber friction).
