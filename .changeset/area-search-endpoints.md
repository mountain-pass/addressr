---
'@mountainpass/addressr': minor
---

Add locality, postcode, and state search endpoints to the v2 HATEOAS API

New endpoints discoverable from the root API:

- `/localities?q=` — Search suburbs/localities by name (fuzzy + prefix matching)
- `/postcodes?q=` — Search postcodes with associated localities
- `/states?q=` — Search states by name or abbreviation

Includes a new `addressr-localities` OpenSearch index populated during G-NAF loading, with postcodes derived from ADDRESS_DETAIL records for complete coverage.
