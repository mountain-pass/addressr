---
'@mountainpass/addressr': minor
---

fix(search): rank exact street address above sub-unit variants

Search queries for a street address that also has sub-unit variants (SHOP, UNIT, FLAT, LEVEL) indexed now return the exact street-level record as the top result, not a sub-unit. Fixes a BM25 scoring asymmetry where sub-unit documents matched the query in both `sla` and `ssla` index fields while street-level documents matched only `sla`, causing sub-units to score roughly double. The fix populates `ssla` symmetrically on every indexed address (equal to `sla` when there is no sub-unit) so per-field score summation is balanced across documents. See ADR 025.

**Consumer-visible impact**: the first result of `/addresses?q=<street-address>` changes for queries whose address has indexed sub-units. BM25 `score` numeric values in API responses also shift across most queries because every document now populates the `ssla` field; absolute score thresholds are not part of the API contract and may need re-baselining. API shape is unchanged: `ssla` was already an optional field on the address schema, it is simply populated on more records.

Fixes https://github.com/tompahoward/addressr/issues/375. Closes P007.
