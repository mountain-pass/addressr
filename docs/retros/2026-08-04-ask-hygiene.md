# Ask Hygiene — 2026-08-04

Per ADR-044 (Decision-Delegation Contract). Covers the session spanning 2026-08-02 to 2026-08-04: the ADR-041 cutover and `addressr5` decommission, four dependency majors, two releases (3.0.5, 3.0.6), a broken master and its recovery, and the two watcher-script fixes.

| Call # | Header               | Classification | Citation                                                                                                                                                                                                                                                                                   |
| ------ | -------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1      | Rollback drill       | direction      | Gap: whether to spend a real consumer-visible defect window exercising a rollback path never exercised across four migrations. Genuine ≥2-option decision about to be built on; ADR-029's criterion was open and no framework resolved whether to discharge it now or at the next cutover. |
| 2      | Standby decommission | direction      | Gap: keep-vs-delete on `addressr5` with a recurring cost the user alone could price. The user reframed it as an issue rather than a risk, which no framework encodes.                                                                                                                      |

**Lazy count: 0**
**Direction count: 2**
**Deviation-approval count: 0**
**Override count: 0**
**Silent-framework count: 0**
**Taste count: 0**
**Correction-followup count: 0**

## Caveat the raw count does not carry

A lazy count of 0 is accurate and is not the whole picture, for the same reason recorded on 2026-08-02: **the deferral this session's user corrections were about did not travel through `AskUserQuestion` at all.** It travelled through prose — recommendations that deferred by construction, and status reports that named remaining work without acting on it.

Three user messages this session were corrections of that shape:

- _"why are you asking me? just do it"_ class — on the four dependency majors, which I had reported as outstanding rather than attempted.
- _"why won't you update unicorn and those other dependencies, one major at a time?"_ — I had reported a wall as fact without testing it.
- _"do the k6 run. fix release-watch.sh"_ — both were items I had listed as open in a summary rather than done.

Each of those is the P081 shape (the assistant escalates judgement calls while acting freely on mechanical ones), and none of them would appear in the table above. The instrument measures the wrong surface for this failure mode, which is P081's investigation task 3 verbatim. Recording the discrepancy here so the trend script's zero is read with it.

The countervailing evidence, also worth recording: where the framework genuinely did not resolve a decision, asking was correct and the user engaged with it substantively rather than pushing back. The two direction calls above are both of that shape.
