---
'@mountainpass/addressr': patch
---

The loader's `COVERED_STATES` filter is now case-insensitive: entries are trimmed and uppercased before matching G-NAF's uppercase state file prefixes, so `COVERED_STATES=nsw` loads the NSW files instead of silently indexing zero documents. The loader now also fails with an error when a non-empty `COVERED_STATES` matches zero G-NAF address detail files, rather than completing with an empty index.
