# Problem 078: phrase_prefix scores depend on which shard a document lands on, because IDF is summed over a per-shard prefix-expansion set

**Status**: Open
**Reported**: 2026-08-02
**Priority**: 8 (Medium) — Impact: 2 × Likelihood: 4 — derived at capture from the description per Step 4a
**Origin**: internal
**Effort**: M — derived at capture per Step 4a
**JTBD**: JTBD-001
**Persona**: web-app-developer

## Description

The search query's `phrase_prefix` clause over `[ssla, sla_range_expanded]` expands the **final** query token against the term dictionary of whichever shard holds the candidate document, then BM25 sums IDF across **every** expansion term. Different shards hold different term dictionaries, so two documents matching the same user phrase can be scored against different expansion sets — and therefore different IDF sums — for an identical query.

### Decisive evidence

Confirmed by `_explain` on the green domain (`addressr6`), 2026-08-02. Query `63 GEOFFREY RD CHITTAWAY POINT`, with the `phrase_prefix` clause isolated as the sole query clause, reproduces the full-query scores exactly (61.171 vs 58.268) — so this one clause accounts for the entire outcome. The matched terms differ in expansion count:

```
RANGE doc (61.171): ssla:"63 GEOFFREY RD CHITTAWAY (POINTON POINTSFIELD POINTS
                    POINTSIDE POINTERS POINTONS POINTE POINT POINTER)"
                    — 9 expansions, idf sum 133.38

EXACT doc (58.268): ssla:"63 GEOFFREY RD CHITTAWAY (POINTSIDE POINTS POINTE
                    POINTER POINTSFIELD POINTONS POINTON POINT)"
                    — 8 expansions, idf sum 120.63
```

The range document's shard also contains `POINTERS`. That single extra expansion is a rare term (n between 1 and 6 against N of ~3.38M, idf 13–14) and contributes 12.75 of idf — which **is** the entire margin. The explain also reports different N per document (3383672 vs 3382615), confirming the two documents sit on different shards.

`POINT` is a **complete word the user typed**, not a partial. Its contribution to the score is nonetheless set by how many unrelated street names happen to begin with "POINT" on the shard that particular document landed on. Two documents that are equally good phrase matches score differently for a reason that has nothing to do with either document.

### `dfs_query_then_fetch` does not fix it

Tested — byte-identical results. DFS normalises term **statistics** (n, N) across shards, but the expansion **set** is built per-shard from the local term dictionary _before_ DFS gathers stats, so there is nothing for DFS to reconcile. Recorded explicitly because `dfs_query_then_fetch` is the textbook remedy for cross-shard scoring skew and it is ineffective against this particular mechanism.

### This pre-exists ADR-041

Not a regression introduced by the equivalent-synonyms change. The mechanism is inherent to `phrase_prefix` on a sharded index and is present on blue (`addressr5`) identically. What ADR-041 changes is the **signal-to-noise ratio, not the noise**: co-positioning authority-table synonyms compresses absolute scores roughly 5× (blue's exact-vs-range gap was 317 vs 261; green's is 61 vs 58), so the same ~13-point expansion noise goes from a small fraction of a 56-point gap to larger than a 3-point gap. Blue is not immune, merely further from the threshold.

## Symptoms

A query for a complete exact address returns a different document — most visibly the range address that contains it — at position 1, with the exact address at position 2. Reproducible per affected pair, and stable for as long as the shard assignment holds.

## Workaround

None applied. The measured rate does not warrant a query change ahead of the corpus-scale verification frame described below.

## Impact Assessment

- **Who is affected**: consumers of the autocomplete/search endpoint who type a complete exact address that also falls inside a range address.
- **Frequency**: 800 pairs sampled from `test/perf/exact-vs-range-frame.json`, each queried through both domains with the production query shape and sort — **793 of 800 top-1 results unchanged** between blue and green; 4 regressions, 3 improvements, **net −1**. **Zero** exact-to-range flips in the random sample: every one of the 4 regressions is a sub-unit reorder at the _correct_ street address (e.g. `24 MARCIA ST COFFS HARBOUR` returning `UNIT 3, 24 MARCIA ST, COFFS HARBOUR NSW 2450`), which is the already-known P073 street-level-vs-sub-unit surface rather than a new class. Three genuine exact-to-range flips were found by targeted hand search across the 5,991-pair frame, so the class is real but rare — on the order of 0.05%.
- **Severity**: a small number of individually-wrong best-matches. No wrong-street answers were observed.
- **Analytics**: separately measured — blue itself returns the range document first in 262 of 500 sampled pairs, so range-first is a large **pre-existing** production characteristic, and green scores identically to blue on exact-first (203 vs 203).

## Root Cause Analysis

IDF is summed over the prefix-expansion set, and that set is constructed per-shard. Score therefore carries a term that depends on shard membership rather than on document content or query match quality.

### Investigation Tasks

- [ ] Build a corpus-scale exact-vs-range relevance regression frame (fixture-scale Cucumber cannot reproduce corpus-relative IDF — the P074 lesson, confirmed again here)
- [ ] Decide between the measured candidate fixes below and re-verify against that frame
- [x] Confirm whether the same mechanism contributes to the P073 and P074 surfaces — **affirmative for P074**, confirmed by `_explain` on `addressr6` 2026-08-06. P073 not re-examined.

### P074 is this mechanism, not a different failure shape (2026-08-06)

The Related section below records P074 as "a different failure shape: the street-level document is not in contention at all". **That is falsified.** On `8 WATERS RD, NEUTRAL BAY NSW 2089` the street-level document loses by 10.65 points, and the entire deficit is this clause: idf sum 44.77 against the sub-unit's 74.66, because the sub-unit's shard expands `2089*` to four terms (three at `n=1`, idf 14.63 each) where the street-level document's shard expands it to two. `bool_prefix` scores the street-level document **higher** on both fields, and `tf` also favours it. The eight sub-units tie at an identical score because they share a shard and therefore an expansion set — that tie is a consequence of the mechanism, not evidence of a separate one.

This materially raises the stakes on the fix decision below: the same mechanism drives a **62.7%** violation rate on the street-level-first property (150-address sample, 2026-08-06), against the ~0.05% exact-vs-range rate recorded above. The `constant_score` candidate measures 2.0% on that property and `max_expansions: 1` measures 0.7%; full table in P074. The Workaround note above — "the measured rate does not warrant a query change" — was written against the exact-vs-range rate alone and no longer reflects the blast radius.

### Candidate fixes, measured

Both measured against the 5,991-pair frame and a 361-probe partial-prefix recall ladder on the green domain.

| Candidate                                                         | Exact-vs-range                        | Partial-prefix recall                                                     |
| ----------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------- |
| `constant_score` wrapper on the `phrase_prefix` clause (boost 20) | fixes 8, breaks 1                     | neutral — 128/361 vs baseline 129 (loses 3, gains 2)                      |
| `max_expansions: 1`                                               | fixes all 3 known flips, breaks 0     | **loses 4 of 361** — `14 FALK`, `49 CHURCH ST`, `6 ILLAW`, `28 GREEN POI` |
| plain `phrase` clause alongside `phrase_prefix`                   | no effect on any of the 3 known flips | unchanged                                                                 |

`constant_score` removes the IDF sum entirely from that clause, so expansion-set composition can no longer influence the score; ranking within the clause falls to the `bool_prefix` clause, which is unaffected. It improves on **both** blue and green.

`max_expansions: 1` is rejected — it degrades the exact property ADR-041 exists to deliver for P069.

### Recommendation

Do **not** bundle a fix into the ADR-041 blue/green cutover. The `constant_score` change is a query-shape change that has had no soak, and landing it with the cutover would invalidate the 33.8-hour read-shadow soak that gates it. The finding pre-exists ADR-041 and improves blue as well as green, so it stands on its own merits as follow-up work rather than as a cutover blocker.

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: P075

## Related

Captured via `/wr-itil:capture-problem`. The Step 2b hang-off arbitration returned `PROCEED_NEW` over five candidates; its reasoning is recorded here so the next reviewer sees what was considered.

- **P075** (ADR-041 inverts exact-vs-range on one address) — the closest candidate, and the instance this mechanism explains. The arbiter found the new evidence **supersedes P075's stated score-ratio-compression mechanism**: P075 attributes the inversion to ADR-041 co-positioning halving IDF, which the `_explain` evidence falsifies. This ticket is a candidate **parent** of P075, not a child. It also answers P075's two open Investigation Tasks — "decide whether the compression is worth treating" and "build a corpus-scale exact-vs-range property check". P075 itself disclaims parent status, directing the clustering decision to `/wr-itil:review-problems`.
- **P073** (ADR-041 equivalent synonyms regress ADR-025 street-level-first) — shares the `phrase_prefix` clause as the locus but a different invariant and a different, already-resolved mechanism (constant +3 tokens compressing the length-norm ratio). This ticket does not expand it.
- **P074** (P007 street-level-first unfixed for half of sub-unit addresses) — different failure shape: the street-level document is not in contention at all (eight sub-units tied at identical scores, tie-break deciding), not a narrow-margin IDF-sum difference.
- **P076** (ADR confirmation items prescribed and never implemented) — governance ticket, shares only the investigation provenance.
- **P072** (architect ISSUES FOUND writes no marker) — shares only an incidental origin line; no relationship to search scoring.
- **ADR-028** — owner of `sla_range_expanded`.
- **ADR-041** — explicitly **not** the cause; it changes the signal-to-noise ratio, not the noise.

Origin: internal, surfaced 2026-08-02 while investigating three exact-vs-range ranking inversions on the green domain during the ADR-041 pre-cutover risk assessment. P075 recorded the symptom; this ticket records the mechanism.
