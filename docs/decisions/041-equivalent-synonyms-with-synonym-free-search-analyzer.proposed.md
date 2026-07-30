---
status: 'proposed'
date: 2026-07-29
human-oversight: unconfirmed
decision-makers: [Tom Howard]
consulted: [wr-architect:agent]
informed: []
reassessment-date: 2026-10-29
---

# Equivalent synonyms with a synonym-free search analyzer

> Captured via /wr-architect:capture-adr (foreground-lightweight aside-invocation per ADR-032, derived-substance amendment 2026-07-06 / RFC-045). Section content was derived by the capturing agent from the in-session decision context; human-oversight: unconfirmed until ratified at the /wr-architect:review-decisions drain.

## Context and Problem Statement

`my_synonym_filter` (`client/elasticsearch.js`) is built by `buildSynonyms` from the G-NAF authority tables as explicit `CODE => NAME` mappings. In those tables the CODE is the **full word** and the NAME is the **abbreviation**:

```
BRIDGE|BDGE|BDGE
STREET|ST|ST
ROAD|RD|RD
S|SOUTH|SOUTH        (STREET_SUFFIX — the one pair that runs the other way)
```

The filter is attached as `analyzer` with no `search_analyzer`, so it runs at **both index and search time** and _replaces_ full words with abbreviations. `55 PYRMONT BRIDGE RD, PYRMONT NSW 2009` therefore indexes as `[55, PYRMONT, BDGE, RD, PYRMONT, NSW, 2009]` — the token `BRIDGE` is never in the index at all.

`match_bool_prefix` makes the final query token a prefix query. A _partial_ token is not a complete synonym code, so it is never rewritten — but the indexed token was. The two can then never meet. Two mechanisms:

- **Partial prefix of an abbreviated word.** `55 Pyrmont Bri` analyses to `[55, PYRMONT, BRI]`; `BRI*` cannot match the indexed `BDGE`. Affects all 194 street types plus 40 flat, 16 level and 18 street-suffix codes.
- **Partial that is itself a code.** `55 Harris S` analyses to `[55, HARRIS, SOUTH]`; `SOUTH*` cannot match the indexed `ST`.

This is P069, reported externally as issue #365. It breaks autocomplete mid-keystroke on the revenue-generating `/addresses?q=` endpoint — the primary product use case. Confirmed by local reproduction on OpenSearch 3.5.0 (the production engine version) using the exact index settings and the real 268-pair synonym list; `_analyze` is the decisive evidence.

## Decision Drivers

- Autocomplete is the primary product use case; a query going blank part-way through typing is a direct product failure, not a ranking nuance.
- The defect is inbound-reported and externally visible (#365), so it carries reporter-facing credibility cost.
- The target token must **physically exist** in the index for a prefix query to reach it — this rules out every query-side-only remedy.
- Street-type equivalence (`ST`/`STREET`, `RD`/`ROAD`) is a genuine recall feature and must survive the fix.
- Mappings are additive-only for new documents, so any analyzer change forces a reindex; the cost of getting this wrong is a second reindex.

## Considered Options

1. **Equivalent synonyms plus a synonym-free `search_analyzer` (chosen)** — index both forms at the same position, and never rewrite the query.
2. **`search_analyzer` alone, synonyms unchanged** — stop rewriting the query but keep directional index-time replacement.
3. **Reverse the mapping direction (`NAME => CODE`)** — abbreviate in the other direction.
4. **Drop the synonym filter entirely** — no street-type equivalence at all.
5. **Query-side tuning only** (`bool_prefix` parameters, `minimum_should_match`) — leave analysis untouched.

## Decision Outcome

Chosen option: **"Equivalent synonyms plus a synonym-free `search_analyzer`"**.

Emit synonyms as equivalents (`BRIDGE, BDGE`) rather than directional replacements (`BRIDGE => BDGE`), so both forms occupy the same position in the index; and add a `search_analyzer` identical to `my_analyzer` minus `my_synonym_filter`, so a partial query token is never rewritten.

This is the only option that puts the token a user actually types into the index while preserving abbreviation equivalence. Validated locally: every keystroke from `55 Pyrmont` through `55 Pyrmont Bridge Road` resolves, as do `55 Harris S` / `St` / `Street`, and both `Rd` and `Road` work.

**Scope — all of the following, or the fix is asymmetric:**

- `sla`, `ssla` **and** `sla_range_expanded`. `search_analyzer` is per-field; if `sla_range_expanded` is missed, the ADR-026 `phrase_prefix` clause keeps synonym-rewriting at search time and breaks differently from the `bool_prefix` clause.
- `initLocalityIndex`, which carries its own duplicated settings block. Missing it falsifies ADR-021's "same analyzer pipeline as address search" confirmation criterion.

## Consequences

### Good

- Partial-prefix recall is restored across the whole street-type/flat/level/suffix vocabulary, not just the two reported queries.
- Both spellings work in both directions: typing `Road` finds `RD` and typing `Rd` finds `ROAD`.
- Removing a token filter from the search path is marginally _less_ per-request work.

### Neutral

- Index size grows roughly 15–25% on the affected text fields. This feeds instance-class and EBS sizing and must be measured empirically on the green build rather than assumed, per the migration playbook's sizing learning.

### Bad

- **Forces a full reindex of ~15M documents.** It cannot be applied in place. Domain-level blue/green per ADR-029 and the OpenSearch migration playbook has been ratified as the cutover mechanism, chosen over an index-alias flip and an `ES_INDEX_NAME` env flip.
- **Alters term statistics.** Two tokens sharing a position changes IDF and field-length norms, so relevance must be re-verified rather than assumed. ADR-025's and ADR-028's confirmation scenarios are at risk.
- **Amends ADR-027.** `RD` becomes indexed as both `ROAD` and `RD`, so `AUTO:5,8` now sees a 4-character `ROAD` alongside `RD` and the fuzziness/synonym interaction changes shape. ADR-027's reassessment criterion 3 (a new recall failure on a query shape outside the baseline) has fired, and its `reassessment-date` of 2026-07-19 has already passed.

## Confirmation

- A behavioural regression test encoding the **property** that a longer valid prefix returns a superset of the shorter prefix's results, across several street types and at least one directional suffix — failing against the old config and passing against the new.
- The ADR-029 pre-cutover gate green against the new index: the SSLA-14 ranking baseline, full Cucumber `test:nogeo` and `test:geo`, and the k6 pair.
- `55 Pyrmont Bri` returns `55 PYRMONT BRIDGE RD, PYRMONT NSW 2009` and `55 Harris S` returns `55 HARRIS ST, PYRMONT NSW 2009`, both from production.
- `_analyze` on the new index shows `BRIDGE` and `BDGE` at the same position for the indexed document, and an unrewritten `BRI` for the query.

## Pros and Cons of the Options

### Equivalent synonyms plus a synonym-free `search_analyzer` (chosen)

- Good, because the token the user types is physically present in the index, which is the only thing that lets a prefix query reach it.
- Good, because equivalence is preserved in both directions.
- Bad, because it forces a full reindex and perturbs term statistics.

### `search_analyzer` alone, synonyms unchanged

- Good, because it is a settings-only change (close/open), no reindex.
- Bad, because it is **strictly worse**: the query would then yield `BRIDGE` against an index holding only `BDGE`, so full-word queries break too.

### Reverse the mapping direction (`NAME => CODE`)

- Good, because it is a one-line change to `buildSynonyms`.
- Bad, because it is still a _replacement_, so it only moves which half of the query shape breaks.

### Drop the synonym filter entirely

- Good, because partial tokens are then never rewritten.
- Bad, because it loses `ST`/`STREET` and `RD`/`ROAD` equivalence, which is real recall the product depends on.

### Query-side tuning only

- Good, because it needs no reindex.
- Bad, because it cannot work — the target token is absent from the index, so no query formulation can reach it.

## Reassessment Criteria

- The measured index-size growth materially exceeds the 15–25% estimate and forces an instance-class change that is not cost-justified.
- The post-cutover relevance gate shows a regression that cannot be recovered by tuning, indicating the co-positioned-token term statistics are not workable.
- G-NAF changes the authority-table schema such that CODE/NAME direction is no longer stable, which would make any synonym derivation fragile regardless of form.
- OpenSearch gains a first-class mechanism for prefix-matching across synonym expansions, making the dual-form index redundant.

## Related

- **P069** — the driving problem; inbound-reported as mountain-pass/addressr#365.
- **ADR-029** — two-phase blue/green; the ratified cutover mechanism for the reindex this forces.
- **ADR-027** — amended by this decision; its reassessment has fired and is overdue.
- **ADR-021** — same-analyzer-pipeline criterion; requires `initLocalityIndex` to receive the identical change.
- **ADR-025**, **ADR-026**, **ADR-028** — relevance and range-expansion decisions whose confirmation scenarios must be re-verified pre-cutover.
- **ADR-035** — its own regression watch-items name this exact surface (the `my_analyzer` synonym filter, `match_bool_prefix`, `AUTO:5,8`).
- `docs/OPENSEARCH-MIGRATION-PLAYBOOK.md` — the blue/green sequence this reindex follows.
