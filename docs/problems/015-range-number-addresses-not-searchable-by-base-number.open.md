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

### Preliminary Hypothesis

G-NAF stores range-number addresses with a hyphenated `NUMBER_FIRST`–`NUMBER_LAST` pair. When indexed, the `sla` field is set to the canonical form (e.g., `225-245 DRUMMOND ST, CARLTON VIC 3053`). The tokenizer (`whitecomma` pattern `[\W,]+` at `client/elasticsearch.js:69-76`) splits on non-word characters including `-`, so `225-245` tokenises to `225` and `245` as separate tokens.

However, the query for `"225 drummond st"` uses `bool_prefix` match which may not score the document highly enough relative to other results, or `225` may not boost correctly when it appears as a fragment of the range token rather than a standalone token.

The `138 Whitehorse Rd` case partially working suggests the issue is scoring (the address appears but ranked low) rather than missing tokens. The `225 Drummond St` case not appearing at all suggests something else — possibly the range token `-` is not split at index time (pattern: `[\W,]+` splits on `\W` which includes `-`), but at query time the analyser tokenises `225` differently.

Owner comment on issue: "I think we can solve this by indexing `225 DRUMMOND ST...` as well as `225-245 DRUMMOND ST`" — suggesting a secondary index field with the expanded base-number form, similar to the `ssla` field added for P007.

### Investigation Tasks

- [ ] Confirm tokenisation behaviour: does `225-245` tokenise to `225` + `245` at index time?
- [ ] Query OpenSearch explain API for `"225 drummond st"` against the Carlton record to see score breakdown
- [ ] Determine if the issue is missing tokens, wrong scores, or both
- [ ] Investigate adding a `sla_base` field that stores the address with the base number only (e.g., `225 DRUMMOND ST, CARLTON VIC 3053`) to allow clean matching
- [ ] Create failing Cucumber scenario: `"225 DRUMMOND ST CARLTON VIC"` → first result is `225-245 DRUMMOND ST, CARLTON VIC 3053`
- [ ] Consider whether fix should extend the `ssla` symmetric-indexing approach (ADR 025) or requires a separate ADR

## Related

- GitHub issue [#367](https://github.com/mountain-pass/addressr/issues/367) — original report
- [ADR 025](../decisions/025-search-ranking-symmetric-ssla.proposed.md) — symmetric ssla indexing (P007 fix) — related approach
- [P007](./007-search-scoring-exact-address-ranked-below-subunits.known-error.md) — search scoring (different but related query-builder issue)
- [`client/elasticsearch.js:58-76`](../../client/elasticsearch.js) — `whitecomma` tokeniser and `my_analyzer`
- [`service/address-service.js:950-1003`](../../service/address-service.js) — `searchForAddress` query builder
