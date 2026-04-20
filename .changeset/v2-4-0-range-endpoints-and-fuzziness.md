---
'@mountainpass/addressr': minor
---

feat(search): sharper number matching and correct range semantics (ADR 027 + ADR 028)

v2.4.0 ships two complementary search-quality fixes that close the remaining gaps in [#367](https://github.com/mountain-pass/addressr/issues/367) reporter `hirani89`'s 2022 cases.

**ADR 027 — numeric fuzziness removed** (`fuzziness: 'AUTO'` → `'AUTO:5,8'`). Under the previous default, 3-4 digit tokens (street numbers, postcodes) allowed 1-char edit distance, so `138 Whitehorse Rd` ranked `135-137 WHITEHORSE RD` ahead of the target `138-144 WHITEHORSE RD` via term-frequency inflation on adjacent fuzzy numbers. Under `AUTO:5,8`, numeric tokens require exact match. 5+ character typo tolerance on street/locality names is preserved (`Muray`→`MURRAY` still works).

**ADR 028 — range addresses use endpoint-only expansion** (supersedes ADR 026). Under the previous full-interpolation shipped briefly in v2.3.0, a G-NAF range like `103-107 GAZE RD` emitted five aliases (103, 104, 105, 106, 107). This produced false positives: under Australian addressing convention, `104` and `106` belong to the opposite side of the street, and `105` may be a separate property. ADR 028 emits exactly two aliases (the first and last G-NAF endpoints). Mid-range queries no longer resolve to the range doc.

**Consumer-visible impact**:

- `"495 Maroondah Hwy Ringwood"` → `495-503 MAROONDAH HWY` at position 1.
- `"138 Whitehorse Rd Blackburn"` → `138-144 WHITEHORSE RD` at position 1 (was 3).
- `"225 drummond st carlton"` → `TRAVEL INN HOTEL, 225-245 DRUMMOND ST` at position 1 (was 6).
- Mid-range queries (e.g. `"104 GAZE RD"`) no longer falsely return range docs whose `NUMBER_FIRST`/`NUMBER_LAST` bracket the number — they return only the actual non-range doc at that number (if one exists).
- Queries with specific street numbers produce sharper, less-noisy result lists. Adjacent-number fuzzy noise is filtered out.

**Correction framing**: v2.3.0 shipped ADR 026 with interpolation for a brief window. Post-deploy smoke revealed the false-positive defect; v2.4.0 corrects it. Consumers who built against v2.3.0 will see mid-range queries return fewer results — this is a correctness fix, not a regression.

**Implementation**:

- `service/address-service.js` — `fuzziness: 'AUTO'` → `'AUTO:5,8'`. No query shape change.
- `service/range-expansion.js` — `expandRangeAliases(first, last, ...)` emits `[firstAlias, lastAlias]` only. `SPAN_CAP` retired (no longer needed; always 2 aliases). Index storage drops vs v2.3.0.
- ADR 025 summation-symmetry invariant preserved (bool_prefix field list and clause shape unchanged).
- ADR 028's `sla_range_expanded` field remains confined to the `phrase_prefix` clause; `tie_breaker=0.0` invariant preserved.
- Reindex on deploy picks up the endpoint-only aliases via the existing loader pipeline. No new operational step.

Resolves the ranking and correctness halves of [#367](https://github.com/mountain-pass/addressr/issues/367) ([P026](../docs/problems/026-numeric-fuzziness-inflates-ranking.open.md) + supersedes ADR 026). See ADR 027 and ADR 028.
