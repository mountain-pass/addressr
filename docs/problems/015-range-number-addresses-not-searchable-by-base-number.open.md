# Problem 015: Range-number addresses not findable by base number

**Status**: Open
**Reported**: 2026-04-16
**Priority**: 12 (High) — Impact: Significant (4) x Likelihood: Possible (3)

> **Framing update (2026-04-19)**: This ticket was scoped as a **recall** problem — "range-number addresses are not findable by mid-range numbers". ADR 026 addressed that scope and shipped in v2.3.0; post-deploy smoke confirmed the target range addresses now appear in result lists for all three reporter cases. However, post-deploy smoke also revealed the reporter's **ranking** complaint for case 3 (`hirani89` 2022-06-24: "comes up, but down the list") was not captured by this ticket's scope and was not fixed by ADR 026. That ranking dimension is the underlying user-facing defect the reporter described, and it is captured in [P026 — Numeric fuzziness in bool_prefix inflates ranking of adjacent docs over exact number matches](./026-numeric-fuzziness-inflates-ranking.open.md). This ticket stays open until P026's fix ships and all three #367 cases rank the target at or near position 1.

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
- [x] Estimate document-size impact across states — measured 2026-04-19 against G-NAF Feb 2026 local cache:
  - OT: 4,335 addrs, **1.25%** range (54), avg span 7.0, max 24
  - ACT: 281,457 addrs, **1.27%** range (3,572), avg span 6.3, max 116
  - NT: 117,410 addrs, **1.98%** range (2,329), avg span 3.0, max 48
  - TAS: 374,088 addrs, **3.66%** range (13,691), avg span 4.6, max 2,000 (outlier — likely data-quality issue)
  - NSW: 5,165,723 addrs, **11.64%** range (601,186), avg span 6.4, max 111,014 (extreme outlier)
  - VIC: 4,370,944 addrs, **6.22%** range (271,693), avg span 7.3, max 9,364 (outlier)
  - QLD: 3,352,604 addrs, **8.25%** range (276,607), avg span 8.1, max 2,940 (outlier) — the reporter's stated target state
  - **Implication**: expanding every number in range into indexed aliases inflates sparse states (OT/ACT/NT) by ~6-13% (tolerable) but NSW by ~70%+ before outlier cap. A cap (e.g., skip expansion when `span > 100`) is required to avoid pathological docs. The `sla_numbers` numeric-array option has lower per-alias cost than the text-alias option; for NSW at 6.4 avg span this is ~3.8M extra keyword values, manageable for OpenSearch.
  - **Verification commands**: `awk -F'|' 'NR>1 && $18!="" && $21!="" && $18!=$21' <STATE>_ADDRESS_DETAIL_psv.psv | wc -l` against `target/gnaf/g-naf_feb26_allstates_gda94_psv_1022/G-NAF/G-NAF FEBRUARY 2026/Standard/`.
- [ ] Create failing Cucumber scenario: `"225 DRUMMOND ST CARLTON VIC"` → first result is `225-245 DRUMMOND ST, CARLTON VIC 3053`. For OT fixture, an equivalent is: `"104 GAZE RD CHRISTMAS ISLAND"` → should return `103-107 GAZE RD, CHRISTMAS ISLAND OT 6798` (record `GAOT_717321171`, range 103→107).
- [ ] Create failing Cucumber scenario: `"225 DRUMMOND ST CARLTON VIC"` → first result is `225-245 DRUMMOND ST, CARLTON VIC 3053`.
- [ ] Decide whether this fix extends ADR 025 (symmetric `ssla` indexing for P007) or warrants a new ADR — a new ADR is likely since the fix introduces a new index field and reindex pass.

## Related

- GitHub issue [#367](https://github.com/mountain-pass/addressr/issues/367) — original report
- [ADR 025](../decisions/025-search-ranking-symmetric-ssla.accepted.md) — symmetric ssla indexing (P007 fix) — related approach
- [ADR 026](../decisions/026-range-number-address-expansion.proposed.md) — range-number expansion via multi-valued text alias field — proposed fix
- [P007](./007-search-scoring-exact-address-ranked-below-subunits.known-error.md) — search scoring (different but related query-builder issue)
- [`client/elasticsearch.js:58-76`](../../client/elasticsearch.js) — `whitecomma` tokeniser and `my_analyzer`
- [`service/address-service.js:950-1003`](../../service/address-service.js) — `searchForAddress` query builder
