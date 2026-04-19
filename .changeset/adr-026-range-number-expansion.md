---
'@mountainpass/addressr': minor
---

feat(address-service): range-number addresses findable by any in-range number (ADR 026)

G-NAF range-numbered addresses (e.g. `103-107 GAZE RD, CHRISTMAS ISLAND OT 6798`) are now searchable by any number in the documented range, not just the canonical hyphenated form. Queries like `"104 GAZE RD"` that previously returned zero results now return the range address. Roughly 7.5% of all Australian addresses are range-numbered; in dense urban states (NSW, QLD, VIC) the figure approaches 10%.

**Consumer-visible impact**: `GET /addresses?q=<mid-range-number> <street> <locality>` now returns the range document in the result list where it was previously absent. Non-range exact matches for the same number continue to rank at or above range documents (BM25 field-length normalisation + best_fields max). Canonical hyphenated-form queries (`"103-107 GAZE RD"`) are unaffected.

**Implementation**: new `sla_range_expanded` multi-valued text field populated asymmetrically on range docs only (span cap 20 excludes data-quality outliers). Added only to the `phrase_prefix` clause of `searchForAddress`, leaving the `bool_prefix` clause unchanged so ADR 025's summation-symmetry property is preserved. Indexed field populates on next deploy reindex.

Resolves [#367](https://github.com/mountain-pass/addressr/issues/367) (covers reporter's `495 Maroondah Hwy`, `138 Whitehorse Rd`, and `225 Drummond St` cases). See ADR 026 and P015.
