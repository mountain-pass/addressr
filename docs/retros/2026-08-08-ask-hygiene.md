# Ask Hygiene — 2026-08-08

Per ADR-044 (Decision-Delegation Contract). Lazy count is the regression metric; target 0.

| Call # | Header       | Classification | Citation                                                                                                                                                                                                                                                                                                                                                                                     |
| ------ | ------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | `Ratify 043` | **lazy**       | `Framework: ADR-064 / ADR-066 — the substance was the maintainer's own proposal ("How about keyword instead of text?"), already directed three times ("so do it", "keep going", "Write it up"). The ask re-presented settled costs as open questions and was rejected verbatim: "what the fuck? that's not what you briefed me before. Why do you keep trying to make it more complicated?"` |

**Lazy count: 1**
**Direction count: 0**
**Override count: 0**
**Silent-framework count: 0**
**Taste count: 0**
**Correction-followup count: 0**

## Trend

| Retro      | Lazy count |
| ---------- | ---------- |
| 2026-07-20 | 0          |
| 2026-08-02 | 0          |
| 2026-08-04 | 0          |
| 2026-08-08 | **1**      |

R6 numeric gate (lazy ≥2 across 3 consecutive retros) does **not** fire — 1 is below the threshold and the two preceding retros are 0.

## Note on the classification

This is scored lazy rather than `direction` despite ADR-074's substance-confirm-before-build carve-out. That carve-out covers surfacing a genuine ≥2-option decision the framework cannot resolve. Here the framework could: the maintainer proposed the mechanism, approved it, and directed implementation three times. The ADR-066 oversight marker did need a human, but the failure was the **shape** of the ask — it bundled the marker with a re-litigation of three costs already recorded in the ADR, two of which were not new.

The correct shape was the one used later the same session: state the decision plainly, note the marker is outstanding, and continue working. The maintainer's two subsequent corrections — _"Both lazy questions"_ and _"I'm not your gopher"_ — are the same class caught at a different surface, and are recorded in `feedback_push_without_confirm` rather than here because they were not `AskUserQuestion` calls.
