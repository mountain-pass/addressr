# Problem 069: Partial-prefix search drops results a shorter query returns

**Status**: Open
**Reported**: 2026-07-29
**Origin**: inbound-reported (#365)
**Priority**: 16 (High) — Impact: Significant (4) × Likelihood: Likely (4) — derived at capture. Impact 4 per RISK-POLICY § Impact: live RapidAPI search/autocomplete returns missing results for a valid, more-specific query, so paid and free-tier consumers get degraded results. Likelihood 4: reproduced by an external reporter and confirmed still present by the maintainer on 2026-07-29 (ADR-076 inbound-report evidence — honest field risk).
**Effort**: L — derived at capture: search-relevance / query-construction tuning in the `/addresses?q=` path (bool_prefix + fuzziness interaction), needs a live reproduction, a query-shape fix, and a behavioural regression test. Non-trivial relevance work — cf. P007 (search-scoring), P026 (numeric ranking).
**WSJF**: 4.0 — (16 × 1.0) / 4
**JTBD**: JTBD-202
**Persona**: web-app-developer

## Description

Reported at [mountain-pass/addressr#365](https://github.com/mountain-pass/addressr/issues/365): a longer, more specific partial query returns **fewer** results than a shorter one. The reporter's case: `55 Pyrmont` includes "55 Pyrmont Bridge Road…" in the results, but `55 Pyrmont Bri` does not.

Confirmed still reproducing on 2026-07-29 (maintainer). A prior review comment incorrectly implied the v2.3.0 search-quality work (auto-fuzziness, range-number expansion, numeric-token ranking) covered this; it does not — those addressed range-number recall (P015) and numeric ranking (P026), not the street-name-prefix recall path. The #365 comment was corrected to retract that claim.

## Symptoms

Adding more characters to a valid prefix query removes correct results that the shorter prefix returned. Affects the live `/addresses?q=` autocomplete/search endpoint.

Widened 2026-07-29: the failing class is any query shaped `<number> <word> <partial-token>`, not just the reporter's street. `55 Harris S` also returns zero despite `55 HARRIS ST, PYRMONT NSW 2009` being indexed. This is the shape a user produces mid-keystroke in an autocomplete field, so the practical effect is that autocomplete goes blank part-way through typing a numbered street address and recovers only on the last character of the street name.

## Reproduction (confirmed against prod 2026-07-29)

Live queries via the RapidAPI gateway:

| query               | result count | includes `55 PYRMONT BRIDGE RD`? |
| ------------------- | -----------: | -------------------------------- |
| `55 Pyrmont`        |            8 | yes (score 12.51, 2nd result)    |
| `55 Pyrmont Bri`    |        **0** | no — empty result set            |
| `55 Pyrmont Bridge` |            4 | yes                              |

The trailing **partial** token `Bri` zeroes the whole result set, while the shorter query (8 results) and the full-word query `Bridge` (4 results) both return the target. So the defect is specific to an incomplete final token.

## Workaround

None for consumers. A shorter query returns the target; typing the full street name prefix drops it.

## Impact Assessment

- **Who is affected**: RapidAPI consumers using autocomplete/partial search (the primary product use case); both paid and free tier.
- **Frequency**: reproducible on the specific query class (street-name prefix following a number); likely a broader class of prefix queries.
- **Severity**: Significant — degraded search results on the revenue-generating endpoint.

## Root Cause Analysis

### Prior hypothesis — DISPROVED 2026-07-29

The earlier hypothesis was that the query is not built with `match_bool_prefix`, so the final incomplete token is matched as a complete term. **That is wrong.** `service/address-service.js:960` already uses `type: 'bool_prefix'` (with a second `phrase_prefix` clause at `:970`), and prefix matching demonstrably works: `Pyrmont Bri` returns 8 results, all `BRIDGEVIEW` matches, so `Bri` is being prefix-expanded correctly. Do not spend time re-checking the query type.

### Confirmed behaviour (live prod probes via the MCP client, 2026-07-29, v3.0.4)

| query            | results | note                                                              |
| ---------------- | ------: | ----------------------------------------------------------------- |
| `55 Pyrmont`     |       8 | `55 PYRMONT BRIDGE RD` 2nd, score 12.507814                       |
| `Pyrmont Bri`    |       8 | prefix matching works — `Bri` → `BRIDGEVIEW`                      |
| `55 Pyrmont Bri` |   **0** | the reporter's case                                               |
| `55 Harris S`    |   **0** | different street, same shape — `55 HARRIS ST` demonstrably exists |

**The defect is much broader than "street-name-prefix recall".** `55 Harris S` returning zero shows the failing class is the general shape `<number> <word> <partial-token>` — which is precisely what a user types into an autocomplete box mid-keystroke. Every partial third token following a number returns an empty result set. `Pyrmont Bri` (no leading number) works, so the leading numeric token is implicated in the interaction, not the prefix machinery on its own.

### Where the remaining investigation should go

The target doc is a plain address (`55 PYRMONT BRIDGE RD, PYRMONT NSW 2009`), not a range-numbered one, so the ADR-026 `sla_range_expanded` path is **not** involved — that field is absent on non-range docs and only appears in the `phrase_prefix` clause.

Both `should` clauses fail simultaneously, which is the surprising part: on a naive reading each should match. `55 HARRIS ST` analyses to `[55, HARRIS, ST]`, so `term(55) AND term(HARRIS) AND prefix(S)` ought to hit, and the `phrase_prefix` clause ought to hit too. Something in analysis is making both miss.

The prime suspect is the custom analyzer at `client/elasticsearch.js:68-77`: `my_analyzer` = `whitecomma` tokenizer + `uppercase`, `asciifolding`, `my_synonym_filter`, `comma_stripper`, `trim`, applied at **both index and search time** (no separate `search_analyzer`). Two specific things to test with `_analyze`:

- The `synonym` filter (not `synonym_graph`) runs at search time on a query whose final token is a partial word. Synonym filters emit tokens at the same position, and `match_bool_prefix` selects the last token _by position_ for its prefix clause — a plausible mechanism for the prefix clause being built against the wrong token.
- `uppercase` runs BEFORE `my_synonym_filter` in the chain. If the supplied synonym list is lowercase, no synonym ever matches, which is a separate latent defect worth confirming while in there.

Next concrete step needs backend access this session did not have (prod is SigV4/OIDC, ADR-034/035):

- `POST /<index>/_analyze` with `my_analyzer` on `"55 Harris S"` and on `"55 HARRIS ST, PYRMONT NSW 2009"`, and compare token streams and positions.
- `GET /<index>/_validate/query?explain=true` and `_search?explain=true` with the exact body `searchForAddress` builds, to see the rewritten Lucene query for the failing case.

### Investigation Tasks

- [x] Reproduce against live/prod search — done 2026-07-29 via the MCP client against v3.0.4; table above. Confirmed the reporter's case and found the wider class.
- [x] Rule out the query-construction hypothesis — the query already uses `bool_prefix`; prefix expansion works (`Pyrmont Bri`).
- [ ] Run `_analyze` on the failing query and the target doc and compare token streams and positions.
- [ ] Run `_validate/query?explain` / `_search?explain` on the exact failing body to see the rewritten Lucene query.
- [ ] Confirm or rule out the synonym-filter position interaction with `match_bool_prefix`.
- [ ] Check whether the lowercase-synonyms-after-uppercase-filter ordering is a real latent defect (separate ticket if so).
- [ ] Fix the query construction so a longer valid prefix never drops a result the shorter prefix returned.
- [ ] Add a behavioural regression test covering the #365 case and the general "longer prefix ⊇ shorter prefix" property.

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: P007 (search-scoring / ranking), P026 (numeric ranking, closed) — same search-relevance subsystem.

## Related

- Origin: [mountain-pass/addressr#365](https://github.com/mountain-pass/addressr/issues/365) (external reporter; comment corrected 2026-07-29).
- Distinct from P015 (range-number recall, closed) and P026 (numeric ranking, closed) — those did not cover street-name-prefix recall.

## Reported Upstream

- **Origin issue**: https://github.com/mountain-pass/addressr/issues/365
- **Acknowledged**: 2026-07-29 — corrected the earlier over-claim; confirmed still open (comment `5109833126`).
