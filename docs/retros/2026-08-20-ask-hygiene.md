# Ask Hygiene — 2026-08-20

Per ADR-044 (Decision-Delegation Contract) / P135 Phase 5. Classification is silent agent judgement;
borderline cases default to `lazy`. Consumed by `check-ask-hygiene.sh` for cross-session trend.

| Call # | Header      | Classification     | Citation                                                                                                                                                                                                                                                                                                                                         |
| ------ | ----------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1      | Auto-check  | direction          | `Gap: whether a settled rule gets a mechanical propagation check. ADR-048 considered and REJECTED the broad form of this instrument and names "stale in meaning while resolving fine" as NOT COVERED, so the framework actively declines to resolve it — a new composing ADR was the only compliant route, and that is the user's to authorise.` |
| 2      | Emails      | silent-framework   | `Gap: what became of six GitHub notification emails is information held only in the maintainer's inbox and account settings. No ADR, policy, WSJF or SKILL can supply it, and every downstream option depended on the answer.`                                                                                                                   |
| 3      | Perf probe  | direction          | `Gap: genuine ≥2-option decision (keep-silent / throttle / repoint-at-production / delete) about a capability's existence, with dependent work about to be built on it (ADR-074).`                                                                                                                                                               |
| 4      | Perf policy | direction          | `Gap: scope of the record — rule out automated perf detection entirely, or only runner-measured. The architect returned [Needs Direction] and explicitly declined to pick; the two produce different repo states.`                                                                                                                               |
| 5      | The rule    | direction          | `Gap: ADR-074 substance-confirm-before-build. The generalisation from one job to a repo-wide rule was the architect's inference, not the maintainer's words, and ADR-051 was about to bind every check in the repo.`                                                                                                                             |
| 6      | Stale jobs  | direction          | `Gap: which terminus a stale-schedule signal should reach. ADR-051 narrows the field to two qualifying shapes but does not pick between them, and P101 left the task open pending exactly this decision.`                                                                                                                                        |
| 7      | The promise | direction          | `Gap: JTBD-100's Desired Outcome wording is substance on an artefact carrying human-oversight: confirmed. ADR-049 routes substance to ratification rather than an autonomous edit.`                                                                                                                                                              |
| 8      | Latency     | direction          | `Gap: whether to diagnose the gateway's existing alerting first or design assuming none. Only the maintainer can see that console; the choice changes what gets built.`                                                                                                                                                                          |
| 9      | Rule scope  | deviation-approval | `Gap: ADR-051, ratified the same day, disqualifies the terminus of five in-force sites including all of ADR-016's availability monitoring. Asking whether a ratified decision should bend under new evidence is ADR-044 category 2 by definition.`                                                                                               |
| 10     | Dead canary | direction          | `Gap: an irreversible production deletion. The harness contract requires confirmation before hard-to-reverse outward-facing actions, so asking is framework-mandated rather than sub-contracted — and ADR-051's own corollary requires that "deleting an unread instrument is not the same as removing protection" be ESTABLISHED, not assumed.` |

**Lazy count: 0**
**Direction count: 8**
**Deviation-approval count: 1**
**Override count: 0**
**Silent-framework count: 1**
**Taste count: 0**
**Correction-followup count: 0**

## Self-critique on the two closest calls

Recorded because a lazy count of zero is the kind of result that should be argued against rather than
accepted.

- **Call 10 (Dead canary)** is the nearest to lazy. ADR-051 arguably resolves it: an instrument measuring
  nothing and alerting nobody is not a control, so deleting it removes nothing. What keeps it out of `lazy`
  is that the action is an irreversible production deletion, and ADR-051's own corollary requires the
  difference between "removing an unread instrument" and "removing protection" to be **established** rather
  than assumed — which is a user-facing judgement, not a lookup.
- **Call 2 (Emails)** could have been skipped by designing for the worst case. It was not lazy because every
  branch downstream depended on the answer, and guessing would have produced a control aimed at a channel
  whose failure mode was unknown. The maintainer's reply reframed the entire problem — "I don't care so much
  how we check it, I care more about how you monitor it" — which is evidence the question was load-bearing
  rather than deferral.

## R6 numeric gate

Prior lazy counts: `2026-08-09: 1`, `2026-08-08: 1`, `2026-08-04: 0`. With this retro at **0**, the R6
condition (lazy count ≥2 across 3 consecutive retros) does **not** fire. No deviation-candidate queued.
