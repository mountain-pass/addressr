# Ask Hygiene — 2026-08-02

Per framework ADR-044 (Decision-Delegation Contract) / framework P135 Phase 5. Classification is silent agent judgement; the lazy count is the regression metric. Target 0.

| Call # | Header         | Classification | Citation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------ | -------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1      | Rollback drill | direction      | `Gap: RISK-POLICY.md prices no impact rung for a deliberate, bounded, reversible rehearsal of a safety mechanism, and no ADR prescribes when to schedule one. Four materially different paths existed (run now / schedule off-peak / verify-without-applying / drop the goal condition) with different consumer-exposure profiles, and the answer was about to be BUILT ON (two production applies). Substance-confirm-before-build per framework ADR-074. Session memory feedback_ask_before_ops_tradeoffs independently directs asking before ops tradeoffs on high-traffic endpoints rather than trusting an agent's "impact is negligible".` |

**Lazy count: 0**
**Direction count: 1**
**Deviation-approval count: 0**
**Override count: 0**
**Silent-framework count: 0**
**Taste count: 0**
**Correction-followup count: 0**

## Notes

Framework-resolved decisions taken silently this session, recorded so the low ask-count is auditable rather than assumed:

- **Declining the prescribed commit helper** (`wr-risk-scorer-restage-commit`) on three separate commits. Framework-resolved: the helper runs a bare `git commit`, which commits the whole index; with the ADR-041 cutover staged, a docs-only commit would have swept production infra into a commit scored as docs-only. Read the helper source, used an explicit pathspec instead, and put the reasoning to the risk scorer, which agreed. No user question needed.
- **Not re-asking about the rollback drill after it scored above appetite.** The user had already chosen among four options with the consumer cost stated in plain terms. Re-surfacing the same decision because the number came back high would be re-litigating a settled, informed choice. The blocker was reported instead.
- **Impact/likelihood rung corrections** were argued to the scorer with evidence rather than put to the user, because RISK-POLICY's own level descriptions settle them.
