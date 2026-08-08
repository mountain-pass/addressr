# Problem 092: CHANGELOG 3.0.8 carries a second unretracted "fixes #375" claim, and its ADR link is about to die

**Status**: Open
**Reported**: 2026-08-08
**Priority**: 4 (Low) — Impact: Minor (2) × Likelihood: Almost certain (2). Impact 2 per RISK-POLICY § Impact: historical-record legibility only. The party the false 2.2.0 claim actually misled — the reporter of [#375](https://github.com/mountain-pass/addressr/issues/375) — has been corrected directly at [comment 5223522329](https://github.com/mountain-pass/addressr/issues/375#issuecomment-5223522329), which is where a reader of that issue lands. Likelihood 2: the defects are already in a published artefact, so the only open question is whether the erratum gets written.
**Origin**: internal — re-homed 2026-08-08 from [P074](../closed/074-p007-street-level-first-unfixed-for-half-of-sub-unit-addresses.md) Fix Strategy prerequisite 14, so the obligation survives that ticket's closure.
**Effort**: S — one forward CHANGELOG entry on the next release, derived from the same text as P007's `## Fix Released` so the surfaces cannot drift.
**WSJF**: 4.0 — (4 × 1.0) / 1
**JTBD**: JTBD-001
**Persona**: web-app-developer

## Description

This ticket exists because closing P074 would have deleted the only record of an outstanding obligation. It carries the residue of that ticket's prerequisite 14 plus two defects discovered after 3.0.8 published.

A published CHANGELOG entry **must not be edited**. It is dated testimony about what a release claimed, and rewriting it erases the evidence that the claim was made — the same principle that keeps ADR-025's falsified Consequences bullet struck-through rather than deleted. So all three items below are fixed by a **forward erratum on the next release**, never by amending the 3.0.8 entry.

### Three defects in the published 3.0.8 entry

1. **A second unretracted "fixes #375".** The entry ends "Fixes [issue #375](https://github.com/mountain-pass/addressr/issues/375)". The 2.2.0 entry already claims to fix it and that claim was false. The corpus therefore carries **two** unretracted claims. The 3.0.8 claim is true and measured; the problem is that a reader of CHANGELOG alone cannot tell which of the two to believe.

2. **A dead ADR link.** The entry links `043-…**proposed**.md`. ADR-043 was promoted to `accepted` on 2026-08-08 and the file renamed, so the published link 404s. This was a knowingly accepted trade — the alternative, pinning to a commit SHA, gives permanently-stale content instead of correct-then-broken, and the link text names the ADR by number and title so a reader recovers it in one directory listing. Recorded rather than regretted.

3. **Latency figures superseded in both directions.** The entry says "p50 160 to 170 ms, p90 202 to 220 ms" and "The p90 sits above the 200 ms we target internally". Those are pre-merge candidate figures. Re-measured post-deploy against the shipped clause (84 samples per arm, 6 replicates over ADR-027's 14 queries, legacy and shipped interleaved in one run): **legacy p50 167 / p90 244 ms, shipped p50 169 / p90 241 ms — delta p50 +1 ms, p90 −3 ms.** So this change does not move p90 at all, and the pre-existing breach of the 200 ms target is materially larger than the entry states (244, not 202). The published figures understate the baseline problem and overstate this change's cost.

## Symptoms

A reader of `CHANGELOG.md` alone, without reaching issue #375, sees two releases claiming to fix the same defect and no indication which held.

## Workaround

None needed. The reporter-facing record is correct: comment 5223522329 retracts the April claim and records what shipped.

## Impact Assessment

- **Who is affected**: readers of the published CHANGELOG and npm release notes who do not follow through to the issue.
- **Frequency**: static — the artefact is published and immutable.
- **Severity**: record legibility. No service, publish, or consumer-correctness effect.
- **Analytics**: not instrumented.

## Root Cause Analysis

Prerequisite 14 specified the erratum as "a new forward entry on the release that ships the fix", derived from the same text as the reporter-facing correction. The reporter-facing half was written and posted; the CHANGELOG half was not, and 3.0.8's window closed on publication. The two halves were specified together precisely so they could not drift, and they drifted.

The latency defect has a different cause and is the more interesting one: the figures were correct when written, and were correctly labelled "measured before merge" after an external-comms review caught that they sat in the same voice as post-implementation results. What no one anticipated was that the post-deploy measurement would move them **in the project's favour**. A caveat written to avoid overstating a benefit ended up preserving an understated one.

### Investigation Tasks

- [ ] Write the forward erratum into the next release's changeset, covering all three defects, derived from P007's `## Fix Released` text.
- [ ] Widen the street-level-first sample and characterise **which** addresses violate, rather than only the rate. Re-homed from P074; it was never load-bearing for the fix and is now a curiosity about the residual population, if any.

## Dependencies

- **Blocks**: (none)
- **Blocked by**: the next release, whenever one is cut for another reason. This should ride an existing release rather than commissioning one.
- **Composes with**: (none)

## Related

- [P074](../closed/074-p007-street-level-first-unfixed-for-half-of-sub-unit-addresses.md) — the parent; this ticket exists so its prerequisite 14 residue survives closure.
- [P007](../closed/007-search-scoring-exact-address-ranked-below-subunits.md) — its `## Fix Released` is the source text the erratum must derive from.
- [ADR-043 — Keyword-prefix anchor for street-level-first ranking](../../decisions/043-keyword-prefix-anchor-for-street-level-first-ranking.accepted.md) — carries the post-deploy latency measurement that supersedes the published figures.
- [Issue #375](https://github.com/mountain-pass/addressr/issues/375) — the reporter-facing half, already discharged.
