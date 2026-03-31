---
status: accepted
date: 2019-01-01
decision-makers: [Tom Howard]
consulted: []
informed: []
---

# ADR 006: G-NAF as the Authoritative Address Data Source

## Context and Problem Statement

Addressr needs a comprehensive, authoritative source of Australian address data for validation, search, and autocomplete.

## Decision Drivers

- Authoritative government data source
- Free and open access
- Comprehensive coverage of all Australian addresses
- Regular updates

## Considered Options

1. **G-NAF (Geocoded National Address File)** -- Australian Government's authoritative address file via data.gov.au
2. **Australia Post PAF** -- commercial address file
3. **Google Geocoding API** -- SaaS geocoding

## Decision Outcome

**Option 1: G-NAF.** Downloaded from data.gov.au CKAN API, cached locally (keyv-file with msgpack, 1-day TTL, 30-day stale fallback), unzipped, parsed from CSV (papaparse), and bulk-indexed into OpenSearch.

The `addressr-loader` binary handles the full pipeline. State-based loading supported via `COVERED_STATES` env var. Geo-enriched loading available via `ADDRESSR_ENABLE_GEO=1`.

### Consequences

- Good: Free, authoritative, comprehensive
- Good: Open data license (EULA shipped with package)
- Bad: Dependent on data.gov.au availability
- Bad: Quarterly update cycle (not real-time)
- Bad: Large data volumes require significant memory (`--max_old_space_size=8196`)
- Bad: Loader must run separately before the server

### Confirmation

- `service/address-service.js` fetches from data.gov.au CKAN API
- `20160226-eula-open-g-naf.pdf` shipped with package
- `addressr-loader` binary in package.json bin entries

### Reassessment Criteria

- G-NAF distribution format changes
- data.gov.au API changes
- Need for more frequent updates
- Licensing changes
