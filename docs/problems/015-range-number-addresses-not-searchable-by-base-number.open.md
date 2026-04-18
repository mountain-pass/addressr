# Problem 015: Range-number addresses not findable by base number

**Status**: Open
**Reported**: 2026-04-16
**Priority**: 12 (High) — Impact: Significant (4) x Likelihood: Possible (3)

## Description

Addresses with hyphenated street number ranges (e.g., `225-245 DRUMMOND ST`) do not appear in search results when a user queries only the base number (e.g., `"225 drummond st"`). The G-NAF data assigns a single range number to properties like multi-tenanted buildings and commercial strips; consumers typically know only one number (the one on the sign, or the one their customer provided) and expect it to resolve.

Reported in GitHub issue [#367](https://github.com/mountain-pass/addressr/issues/367).

## Symptoms

- Searching `"495 Maroondah Hwy Ringwood"` does not return `495-503 MAROONDAH HWY, RINGWOOD VIC 3134`.
- Searching `"225 Drummond St Carlton"` does not return `225-245 DRUMMOND ST, CARLTON VIC 3053`.
- Searching `"138 Whitehorse Rd Blackburn"` returns `138-144 WHITEHORSE RD, BLACKBURN VIC 3130` for some queries but not others — inconsistent behaviour suggests partial indexing or ranking issue.
- Users must know the exact hyphenated form to find these addresses.

## Workaround

Users must enter the exact range form (e.g., `"495-503 Maroondah Hwy"`) to find range-number addresses. Not viable for end-user-facing autocomplete flows.

## Impact Assessment

- **Who is affected**: All RapidAPI consumers using `/addresses` for autocomplete or address validation where commercial or multi-tenanted addresses are common (retail, hospitality, real estate).
- **Frequency**: Commercial strips, shopping centres, apartment blocks, and converted buildings — common in urban areas.
- **Severity**: Significant — addresses that exist in G-NAF simply cannot be found, producing false "address not found" results for valid inputs.
- **Analytics**: N/A

## Root Cause Analysis

### Confirmed Hypothesis (2026-04-19, user direction)

The indexing pipeline does **not** expand hyphenated ranges into individual findable forms. G-NAF provides both `NUMBER_FIRST` and `NUMBER_LAST` per address record (`service/address-service.js:671-696` captures both into `structured.number` and `structured.number.last`). When `mapToMla` stringifies the address (`service/address-service.js:557-571`), any range becomes `"<first>-<last>"` (e.g., `225-245`), and `mapToSla` joins the full address into the hyphenated canonical form. This is the only form written to the `sla` / `ssla` fields.

`searchForAddress` (`service/address-service.js:952-1001`) queries exclusively against `sla` and `ssla` using `bool_prefix` + `phrase_prefix` match, so the only way to hit a range record via number is to type the full hyphenated form. Any number that falls within the range but is not the `NUMBER_FIRST` or `NUMBER_LAST` token simply doesn't index.

**User direction**: G-NAF provides start+stop, so we can make every number in the range findable — either by expanding into an indexed-field array (e.g., `sla_numbers: [225, 226, ..., 245]`) or by emitting a parallel text alias per number (e.g., `225 DRUMMOND ST, CARLTON`, `226 DRUMMOND ST, CARLTON`, ..., `245 DRUMMOND ST, CARLTON`) on the record. The first option keeps document size contained; the second option aligns with the existing text-matching approach used by `sla`/`ssla` and ADR 025's symmetric indexing pattern for P007.

The earlier issue-comment ("index `225 DRUMMOND ST...` as well as `225-245 DRUMMOND ST`") is a subset of this — only the base number. The confirmed hypothesis broadens that to cover every number in the range, which resolves the `138 Whitehorse Rd Blackburn` case (138 is the base = NUMBER_FIRST) and the `140 Whitehorse Rd Blackburn` case (140 is mid-range and currently unreachable) alike.

### Investigation Tasks

- [x] Confirm range addresses are not expanded in the index — verified in `service/address-service.js:557-571` (`mapToMla` produces only the hyphenated string).
- [x] Confirm G-NAF provides `NUMBER_FIRST` and `NUMBER_LAST` — verified in `service/address-service.js:671-696`.
- [ ] Query OpenSearch explain API for `"225 drummond st"` against the Carlton record to confirm zero match (not just low score) for the base number.
- [ ] Decide index shape — `sla_numbers` numeric array field, or per-number text alias entries in a new text field (e.g., `sla_range_expanded`). Decision depends on whether we want numeric range matching (cheaper) vs. text-matching parity with `sla` (more consistent with existing ranking).
- [ ] Estimate document-size impact on a typical state (QLD ~2M addresses). Ranges tend to be short (<10 numbers) but a few corner cases like shopping-centre strips can span 50+ numbers — worth measuring before committing to index shape.
- [ ] Create failing Cucumber scenario: `"225 DRUMMOND ST CARLTON VIC"` → first result is `225-245 DRUMMOND ST, CARLTON VIC 3053`.
- [ ] Decide whether this fix extends ADR 025 (symmetric `ssla` indexing for P007) or warrants a new ADR — a new ADR is likely since the fix introduces a new index field and reindex pass.

## Related

- GitHub issue [#367](https://github.com/mountain-pass/addressr/issues/367) — original report
- [ADR 025](../decisions/025-search-ranking-symmetric-ssla.proposed.md) — symmetric ssla indexing (P007 fix) — related approach
- [P007](./007-search-scoring-exact-address-ranked-below-subunits.known-error.md) — search scoring (different but related query-builder issue)
- [`client/elasticsearch.js:58-76`](../../client/elasticsearch.js) — `whitecomma` tokeniser and `my_analyzer`
- [`service/address-service.js:950-1003`](../../service/address-service.js) — `searchForAddress` query builder
