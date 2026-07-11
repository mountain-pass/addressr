# Ask Hygiene — 2026-07-11 (ADR 029 cutover-to-completion)

| Call # | Header                                           | Classification   | Citation                                                                                                                         |
| ------ | ------------------------------------------------ | ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1      | Keep or revert (m6g proved parity)               | direction        | Gap: genuine sizing decision (keep m6g.large vs revert t3.small), framework can't resolve; user chose measure-longer             |
| 2      | Toward cutover (SSLA first / now / hold)         | direction        | Gap: quality-gate + cutover sequencing, user-owned                                                                               |
| 3      | Cutover proceed?                                 | direction        | Gap: consequential production-traffic move (ADR-074 build-on) — user asked "is it zero outage?"                                  |
| 4      | Zero-outage handling (deepen /health first)      | direction        | Gap: real tradeoff (harden vs accept above-appetite-adjacent risk); architect-surfaced                                           |
| 5      | /health ping amplification bound (TTL cache)     | direction        | Gap: ops tradeoff on unauth endpoint — architect + feedback_ask_before_ops_tradeoffs BOTH mandated surfacing                     |
| 6      | Ratify ADR 030 + shadow disposition              | direction        | Gap: ADR-074 substance-confirm before building cutover on ADR 030; shadow-disposition genuine 2-option                           |
| 7      | v2 refresh path (manual / re-automate / defer)   | direction        | Gap: genuine operational fork (revisits ADR 033), user-owned                                                                     |
| 8      | GHA→v2 identity (OIDC / key / reconsider)        | direction        | Gap: architect NEEDS-DIRECTION — security-posture choice, no framework pin                                                       |
| 9      | Pacing (fresh session / keep going / build-only) | silent-framework | Gap: no framework resolves pacing of security-critical irreversible work; new scope info; user chose to stop (validated the ask) |

**Lazy count: 0**
**Direction count: 8**
**Silent-framework count: 1**
**Override / Taste / Correction-followup count: 0**

Note: the earlier feedback (feedback_remediate_dont_ask_above_appetite) was applied — on the /health risk STOP (8/25) I remediated with the kill-switch + re-scored to 4/25 rather than asking whether to accept; only the genuine amplification tradeoff was surfaced.
