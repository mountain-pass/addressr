---
status: 'proposed'
date: 2026-04-19
decision-makers: [Tom Howard]
consulted: []
informed: []
reassessment-date: 2026-07-19
---

# ADR 027: Disable fuzziness on short tokens via `AUTO:5,8`

## Context and Problem Statement

Problem [P026](../problems/026-numeric-fuzziness-inflates-ranking.open.md) documents that the `searchForAddress` `bool_prefix` clause uses `fuzziness: 'AUTO'` (= `AUTO:3,6`), which allows a 1-character edit for 3-5 char tokens. Street numbers are almost always 3-5 digits, so adjacent numbers (`135-137` vs `138`) fuzzy-match each other, inflating term-frequency on docs that don't contain the exact query number. In production v2.3.0 this causes:

- `"138 Whitehorse Rd Blackburn"` → `135-137 WHITEHORSE RD` ranks first; the target `138-144 WHITEHORSE RD` ranks 3 (baseline query 2).
- `"225 drummond st carlton"` → `CARSPACE 225, 255 DRUMMOND ST` ranks first via tf=2 (225 exact + 255 fuzzy); the target `TRAVEL INN HOTEL, 225-245 DRUMMOND ST` ranks 6 (baseline query 3).

Both cases are documented in reporter `hirani89`'s 2022 comments on [#367](https://github.com/mountain-pass/addressr/issues/367) and re-confirmed in the v2.3.0 smoke baseline at `docs/problems/026-baseline-v2.3.0.md`.

## Decision Drivers

- **Ranking correctness on the core user task** (J1, J3): an exact-matching numeric token should outrank fuzzy-adjacent numeric tokens. `138` and `137` are different addresses; fuzziness has no semantic basis for numbers.
- **Preserve useful typo tolerance**: 5+ character typo tolerance is relied on by real users (baseline query 8 shows `"Muray"` → `"Murray"` works and must continue to).
- **Smallest possible diff**: 1-character change to an existing parameter is preferable to query-shape restructure.
- **Engine-agnostic** (ADR 021): `AUTO:<low>,<high>` is standard Lucene fuzziness syntax, portable to any BM25/Lucene-family backend.
- **No mapping / reindex / storage impact**: query-time parameter tune only.
- **ADR 025 and ADR 028 invariants must remain intact** (ADR 028 supersedes ADR 026 in the same v2.4.0 release).

## Considered Options

### Option A — `AUTO:5,8` (chosen)

Tune the existing `fuzziness` parameter from the default `AUTO` (= `AUTO:3,6`) to `AUTO:5,8`. Edit distances by token length:

| Length | Default `AUTO` | `AUTO:5,8` |
| ------ | -------------- | ---------- |
| 0-2    | 0              | 0          |
| 3-4    | 1              | **0**      |
| 5-7    | 1 or 2         | 1          |
| 8+     | 2              | 2          |

Street numbers (typically 3-4 digits), postcodes (4 digits), and 4-char street names (`Park`, `Oak`, `Gaze`, `Rose`, `VIC`) lose fuzz. 5+ character typos (`Muray`, `Gorge`, `Canbera`) retain 1-edit tolerance. 8+ character names (`Whitehorse`, `Maroondah`, `Drummond`, `Christmas`) retain 2-edit tolerance.

- **Good**: 1-character diff. No query shape change. No mapping / reindex / storage impact. ADR 025 summation-symmetry preserved (field list, clause structure unchanged). ADR 028 `phrase_prefix` clause (inherited from the superseded ADR 026), `sla_range_expanded` field, and `tie_breaker=0.0` invariant all untouched. Rollback is trivial (revert the 4-char string).
- **Bad**: 4-char street-name typo tolerance is lost. `"Pakr"` → `"Park"` no longer fuzz-matches. Minor; 1-edit fuzz on 4-char tokens already matches many unrelated words, and the 4-char class is small (some locality names are also ≤4 chars e.g. `Ryde`, `Eden`).
- **Neutral**: 6-7 char terms drop from 2 edits to 1 edit. 2-edit typos are uncommon in practice (2 mistyped chars in a 6-char word is rare).

### Option B — `AUTO:4,7`

Boundary neighbour: 0-3 chars → 0 edits, 4-6 chars → 1 edit, 7+ → 2 edits.

- **Good**: preserves 4-char typo tolerance (Park, Oak).
- **Bad**: 4-digit numbers (postcodes, and 1000-9999 range of street numbers) still fuzz at 1 edit → `2000` still fuzzes to `2001`. The bug only partly fixed — common NSW street numbers (1000s) and postcodes remain affected.

Rejected: incomplete fix.

### Option C — `AUTO:6,10`

More conservative: 0-5 chars → 0 edits, 6-9 chars → 1 edit, 10+ → 2 edits.

- **Good**: kills fuzz on all 5-digit numbers including rural property numbers like `12345`.
- **Bad**: kills 5-char typo tolerance (`Muray` → `Murray`). Baseline query 8 confirms this typo is handled today and is a stated persona need (J1 job story: "fuzzy matching to handle typos"). Rejected: removes a working persona capability.

### Option D — Split query by token type (P026 "Fix Strategy" original proposal)

Pre-process `searchString`, classify tokens as numeric vs non-numeric, build two `bool_prefix` clauses with different fuzziness, restructure `should` → `must`.

- **Good**: semantically precise — fuzziness only applies where typo tolerance is wanted.
- **Bad**: architect review of the naive form revealed that `should` → `must` drops `sla_range_expanded` from the matching contract and regresses ADR 026's core recall guarantee — the range doc for `"104 GAZE RD"` would be excluded because `104` is not a token in its `sla`/`ssla` (only in `sla_range_expanded` in the `phrase_prefix` clause, which is downgraded from required to scoring-only under a populated `must`).
- **Bad**: fixing that defect requires either adding `sla_range_expanded` to the numeric must clause (reintroduces P007-shape asymmetry unless symmetric population — ADR 026 Option C was rejected for +40-60% index growth) OR a more complex filter structure.
- **Bad**: query-time token classification on free-form input is brittle (ADR 025 Option E precedent rejected similar reasoning).
- **Bad**: materially larger diff than a single parameter tune.

Rejected: Option A achieves the same goal via a single-parameter tune without any of these risks.

### Option E — Do nothing

- **Good**: zero engineering cost.
- **Bad**: baseline queries 2 and 3 continue to mis-rank the target address. Reporter `hirani89`'s 2022 complaint remains unresolved in substance. Rejected.

## Decision Outcome

**Option A — `AUTO:5,8`** chosen.

The decision is driven primarily by **smallest-possible diff that fully fixes the problem class** (Decision Drivers). `AUTO:5,8` cleanly removes fuzziness from every numeric token addressr handles (3-4 digit street numbers, 4-digit postcodes) while preserving 5-char typo tolerance that baseline query 8 confirms is actively used (`Muray` → `Murray`). The 4-char typo loss is acknowledged and accepted as the smaller-harm side effect compared to leaving numeric fuzz in place.

**Interaction with ADR 025 — explicit non-triggering**: ADR 025's reassessment criterion 2 flags when the query is changed away from `multi_match type: 'bool_prefix'`. This change retains `bool_prefix`, retains the field list `['sla', 'ssla']`, retains the `operator: 'AND'` combinator, and only tunes a single parameter. Summation symmetry is structurally preserved. ADR 025 is not re-evaluated.

**Interaction with ADR 028 — explicit non-triggering**: ADR 028 (which supersedes ADR 026 in the same v2.4.0 release) inherits the same `phrase_prefix` / `sla_range_expanded` / `tie_breaker=0.0` invariants. This change does not add `sla_range_expanded` to `bool_prefix` (still confined to `phrase_prefix`). It does not touch `tie_breaker`. ADR 028 invariants hold.

**Release bump level**: `minor`. Consistent with ADR 025, ADR 026, and ADR 028 precedent — any consumer-visible ranking change on the RapidAPI listing warrants a minor bump so auto-updating consumers know results may shift. v2.4.0 ships both ADR 027 and ADR 028 together under a single minor bump.

## Consequences

### Good

- The P026 failure modes disappear: `"138 Whitehorse Rd Blackburn"` ranks `138-144` ahead of `135-137`; `"225 drummond st carlton"` ranks `TRAVEL INN HOTEL 225-245` above the CARSPACE unit.
- Result lists become sharper: adjacent-number noise is filtered out rather than padded in. Fewer results, more relevant.
- Postcode-only queries become more deterministic (4-digit postcode no longer fuzz-matches adjacent postcodes).
- Query-side typo tolerance for 5+ character names fully preserved.
- No mapping change, no reindex, no storage change. Deploys without a reindex delay. Rollback is a 4-char source revert.

### Neutral

- 6-7 char terms drop from 2 edits to 1 edit of tolerance. 2-edit typos are rare; no measured regression in baseline.
- 8+ char names (`Whitehorse`, `Christmas`) unchanged.

### Bad

- **4-char street/locality name typo tolerance lost**. A user typing `Pakr` for `Park`, `Eedn` for `Eden`, `Ryd` for `Ryde`, `Gazz` for `Gaze`, etc., will not fuzz-match. This is an acknowledged side effect. Users with a typo on a 4-char name must correct it before searching — or supply enough other tokens (street number, locality, postcode) to disambiguate without relying on fuzziness on the 4-char token.
- **Postcode prefix behaviour unchanged**. Note that baseline query 12 (`"3053"` → `30536 BRAND HWY`) is not addressed by this ADR — that is a separate `bool_prefix` **prefix** semantic (not fuzziness). Future work if reported.

## Confirmation

- **Unit test** in `test/js/__tests__/address-service.test.mjs`: source-pattern assertion that the `bool_prefix` `multi_match` clause in `searchForAddress` sets `fuzziness: 'AUTO:5,8'` (not `'AUTO'`, not `'AUTO:6,8'`, not `'AUTO:4,7'`).
- **Cucumber non-regression**: `addressv2.feature:95,109` (ADR 025 P007) continues to pass. ADR 028 first-endpoint, last-endpoint, and canonical-range scenarios continue to pass. (Mid-range recall scenarios from the superseded ADR 026 were false positives and have been removed as part of ADR 028.)
- **New Cucumber scenario — P026 case 3 first result** in `addressv2.feature`: query `"138 Whitehorse Rd"` against OT fixture equivalent (note: OT has no `Whitehorse` street; use the OT equivalent `"108 GAZE RD CHRISTMAS ISLAND"` where the range doc `103-107 GAZE RD` should NOT appear because `108` is outside the range, and no exact 108 exists in range form, but is a standalone non-range at `GAOT_718446689`). Assert top result is `GAOT_718446689`.
- **New Cucumber scenario — 5-char typo preservation** in `addressv2.feature`: query `"19 Muray Rd Christmas Island"` returns `GAOT_717321355` as first result. Proves AUTO:5,8 retains 5-char typo tolerance.
- **New Cucumber scenario — 4-char typo intentional loss (documentation test)** in `addressv2.feature`: query `"16 Gazz Rd Christmas Island"` does NOT return any 16 GAZE RD record in the top 3. Scenario explicitly tagged `@known-regression-adr-027` to document the accepted trade-off rather than assert it as a feature.
- **Post-deploy diff**: rerun all 14 queries from `docs/problems/026-baseline-v2.3.0.md` against production v2.4.0. Rank shifts must match the expectations enumerated in that baseline document. Any unexpected change → investigate before proceeding.

## Pros and Cons of the Options

### Option A — `AUTO:5,8` (chosen)

- Good: smallest diff that fully fixes numeric-fuzz class.
- Good: preserves 5+ char typo tolerance (observed in baseline).
- Good: no ADR 025 / ADR 028 reassessment triggered.
- Bad: 4-char typo tolerance lost. Accepted.

### Option B — `AUTO:4,7`

- Good: preserves 4-char typo tolerance.
- Bad: 4-digit numbers and postcodes still fuzz. Bug only partly fixed. Rejected.

### Option C — `AUTO:6,10`

- Good: kills 5-digit number fuzz too.
- Bad: kills 5-char typo tolerance (`Muray`). Baseline shows this is used. Rejected.

### Option D — Query token-type split (P026 original strategy)

- Good: semantically precise.
- Bad: naive form breaks ADR 026 recall. Fixes require storage cost or complex query shape. Materially larger diff. Rejected.

### Option E — Do nothing

- Good: zero cost.
- Bad: P026 unresolved. Rejected.

## Reassessment Criteria

Re-visit this decision if any of the following occur:

- A user reports a typo-tolerance regression on a 4-char street or locality name that wasn't anticipated (e.g., a specific community name that's commonly mis-typed).
- The `fuzziness` parameter is moved to a different clause, or `bool_prefix` is replaced. Decision becomes moot — re-evaluate under the new structure.
- `AUTO:5,8` proves insufficient and a new ranking inversion emerges on query shapes not covered by the baseline. At that point, reconsider Option D (query token-type split) with the architect-recommended shape (filter for numeric exactness, or `sla_range_expanded` symmetric population per ADR 026 Option C).
- ADR 021's multi-backend ships with a backend whose fuzziness semantics don't map cleanly to Lucene `AUTO:<low>,<high>`. Re-evaluate per-backend.
- The 4-char regression test (`@known-regression-adr-027`) is deleted without an ADR update — the accepted trade-off becomes unattributed.

## Related

- [Problem P026 — Numeric fuzziness in bool_prefix inflates ranking](../problems/026-numeric-fuzziness-inflates-ranking.open.md)
- [Baseline capture for P026 (v2.3.0)](../problems/026-baseline-v2.3.0.md) — 14-query pre-change snapshot used for post-deploy diff.
- [ADR 025 — Symmetric `ssla` indexing for search ranking](025-search-ranking-symmetric-ssla.accepted.md) — explicit non-triggering.
- [ADR 028 — Range-number address expansion, endpoint-only](028-range-number-endpoint-only.proposed.md) — explicit non-triggering. Ships together in v2.4.0.
- [ADR 026 — Range-number address expansion (SUPERSEDED)](026-range-number-address-expansion.superseded.md) — the predecessor decision that ADR 028 replaces.
- [ADR 021 — Retain OpenSearch with future multi-backend support](021-retain-opensearch-plan-multi-backend.proposed.md) — engine-agnosticism driver.
- GitHub issue [#367](https://github.com/mountain-pass/addressr/issues/367) — reporter `hirani89`'s original reports, including the two cases (#138-144 "down the list", `225-245` "does not show") that this ADR aims to resolve in full.
- OpenSearch `fuzziness` documentation: [Common options > Fuzziness](https://opensearch.org/docs/latest/query-dsl/full-text/#fuzziness).
