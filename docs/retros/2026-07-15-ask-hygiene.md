# Ask Hygiene — 2026-07-15

Session: OpenSearch 2.19→3.5 cutover + v2 decommission + ADR-035 promotion.

| Call # | Header          | Classification | Citation                                                                                                                                                                                                                                                                                             |
| ------ | --------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | Finish cutover  | direction      | Gap: soak-duration-vs-completion for an above-appetite irreversible cutover is a user-owned ops tradeoff; no policy/WSJF resolves it (ADR-074 about-to-be-built-on). User deflected with "how is the soak looking now?"                                                                              |
| 2      | Close out v3    | direction      | Gap: same above-appetite cutover-timing decision, re-surfaced structured after the completion stop-hook fired; user owns the go/no-go. User chose "Cut over now."                                                                                                                                    |
| 3      | Decommission v2 | direction      | Gap: irreversible destroy of the rollback-net domain is a user-owned ops decision (feedback_zero_outage_search_upgrades); framework does not resolve when to give up the warm rollback. User chose "safe parts now, hold the delete."                                                                |
| 4      | v2 destroy      | **lazy**       | Framework: RISK-POLICY.md `Threshold: 5` + `risk-gate.sh` denies only `score > 5` — a residual of 5 is WITHIN appetite. Framed the ask as "above appetite STOP" off a mis-read of the scorer's ">4" prose; the framework resolved it (proceed). User corrected: "I thought our risk appetite was 5." |

**Lazy count: 1**
**Direction count: 3**
**Override count: 0**
**Silent-framework count: 0**
**Taste count: 0**
**Correction-followup count: 0**

Trend: 2026-05-14 = 0, 2026-07-08 = 1, 2026-07-11 = 0, 2026-07-15 = 1. R6 gate (lazy ≥2 across 3 consecutive retros) does NOT fire.

## Iteration retro — AFK work-problems P019 (K→V transition)

No `AskUserQuestion` calls this iteration (AFK subprocess; ADR-013 Rule 6).

| Call # | Header | Classification | Citation |
| ------ | ------ | -------------- | -------- |
| —      | (none) | —              | —        |

**Lazy count: 0**
**Direction count: 0**
**Override count: 0**
**Silent-framework count: 0**
**Taste count: 0**
**Correction-followup count: 0**

R6 trend check: `wr-retrospective-check-ask-hygiene` shim absent in this adopter repo (P049) — manual read of trail: 2026-05-14 = 0, 2026-07-08 = 1, 2026-07-11 = 0, 2026-07-15 = 1, this iter = 0. R6 gate does NOT fire.
