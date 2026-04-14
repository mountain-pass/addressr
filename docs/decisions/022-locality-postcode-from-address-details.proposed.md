---
status: 'proposed'
date: 2026-04-14
decision-makers: [Tom Howard]
consulted: []
informed: []
reassessment-date: 2026-07-14
---

# ADR 022: Derive Locality Postcodes from ADDRESS_DETAIL During Loading

## Context and Problem Statement

The new locality search index (`addressr-localities`, see [ADR 021](021-retain-opensearch-plan-multi-backend.proposed.md)) needs postcode data so that postcode search (`/postcodes?q=...`) can return localities associated with a given postcode. The G-NAF LOCALITY table has a `PRIMARY_POSTCODE` field, but it is almost entirely unpopulated — only ~4% of NSW localities have it set, and OT (Other Territories) has zero. The authoritative postcode data lives on `ADDRESS_DETAIL` records, where every address has both a `LOCALITY_PID` and a `POSTCODE`.

A decision is needed on how to populate the postcode field(s) on locality index documents.

## Decision Drivers

- Postcode data must be accurate and complete for the postcode search endpoint to be useful
- Must not degrade address loading performance or reliability
- Must not require a second pass through the data or an additional query after loading
- Memory overhead during loading must be reasonable (~16k localities × a few postcodes each)
- Loader isolation: locality indexing failures must not affect address loading (per release strategy)

## Considered Options

1. **Accumulate postcodes from ADDRESS_DETAIL during streaming** — build a `Map<LOCALITY_PID, Set<POSTCODE>>` while streaming address details, use it when indexing localities after address loading completes
2. **Query the address index post-load** — after addresses are indexed, run an ES aggregation (`LOCALITY_PID → postcodes`) and use the result when indexing localities
3. **Use PRIMARY_POSTCODE from LOCALITY table only** — index whatever is in the G-NAF LOCALITY table's `PRIMARY_POSTCODE` field

## Decision Outcome

**Option 1: Accumulate from ADDRESS_DETAIL during streaming**, because it provides complete and accurate postcode data with minimal overhead, no coupling between indices, and no extra data pass.

### Consequences

#### Good

- Complete postcode coverage — every locality that has addresses will have associated postcodes
- No extra ES queries or second data pass — postcodes collected as a side effect of existing address streaming
- No coupling between the address index and the locality index during loading
- Handles localities with multiple postcodes naturally (a `Set` per locality)

#### Neutral

- Adds modest memory during loading: ~16k map entries × ~1-3 postcodes per locality ≈ negligible vs the address data already in memory

#### Bad

- Localities with no addresses (e.g., topographic localities with class code `T`) will have no postcode data — but these don't have meaningful postcodes anyway
- The postcode list is derived from current address data, not from an authoritative postcode-to-locality mapping — but G-NAF does not provide such a mapping table

### Confirmation

- `loadContext.postcodesByLocality` is initialised as an empty object before the address loading loop in `loadGnafData()`
- During `loadAddressDetails()`, each `ADDRESS_DETAIL` row's `LOCALITY_PID` and `POSTCODE` are accumulated into `loadContext.postcodesByLocality`
- When building locality index documents, postcodes are sourced from `loadContext.postcodesByLocality[LOCALITY_PID]`, falling back to `PRIMARY_POSTCODE` from the LOCALITY table if no address-derived postcodes exist
- The postcode search endpoint returns results for OT data (e.g., `679` → `6798` → CHRISTMAS ISLAND)

## Pros and Cons of the Options

### Option 1: Accumulate from ADDRESS_DETAIL during streaming

- Good: Complete and accurate — derived from actual address records
- Good: No extra ES queries, no second pass, no index coupling
- Good: Handles multi-postcode localities naturally
- Bad: Small memory overhead during loading (negligible in practice)
- Bad: Localities without addresses get no postcodes

### Option 2: Query the address index post-load

- Good: Complete data — same source as Option 1
- Good: No memory overhead during loading
- Bad: Couples locality indexing to the address index being available and queryable
- Bad: Adds an ES aggregation query during loading — slower, more failure points
- Bad: Violates the principle that locality indexing failures should be isolated from address loading

### Option 3: Use PRIMARY_POSTCODE from LOCALITY table only

- Good: Simplest implementation — just use the field that's already loaded
- Good: No changes to the address loading path
- Bad: Only ~4% of localities have this field populated (tested on NSW data)
- Bad: OT (test fixture) has zero populated — postcode search would return no results in tests
- Bad: Renders the postcode search endpoint essentially non-functional

## Reassessment Criteria

- G-NAF introduces a dedicated LOCALITY_POSTCODE cross-reference table
- The `PRIMARY_POSTCODE` field population rate significantly improves
- Memory constraints on the loader become a concern at scale
