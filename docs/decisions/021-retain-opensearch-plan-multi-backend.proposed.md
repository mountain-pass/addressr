---
status: 'proposed'
date: 2026-04-13
decision-makers: [Tom Howard]
consulted: []
informed: []
reassessment-date: 2026-07-13
---

# ADR 021: Retain OpenSearch with Future Multi-Backend Support

## Context and Problem Statement

Addressr currently uses AWS OpenSearch Service as its sole search engine for Australian address autocomplete (see [ADR 002](002-opensearch-as-search-engine.accepted.md)). Two pressures are driving a re-evaluation:

1. **Cost**: The hosted OpenSearch domain is the largest single line item in the AWS bill, disproportionate for a side project running on nano spot instances.
2. **New feature demand**: Customers are requesting locality (suburb) and postcode autocomplete search as separate endpoints (e.g., "PARR" → PARRAMATTA, PARRABEL; "206" → 2060, 2065). This is the same prefix/fuzzy text search problem as address search, applied to a smaller dataset (~16k localities, ~2.6k postcodes).

Additionally, addressr serves two deployment scenarios with different constraints:

- **Hosted service** (RapidAPI): Cost is the primary concern. Infrastructure is controlled by the project maintainer.
- **Self-hosted users**: Simplicity is the primary concern. Users do not want to introduce additional vendor dependencies. Running OpenSearch alongside the app is already burdensome (~1-2GB RAM minimum).

Note: OpenSearch 1.3.x (currently pinned per ADR 002) reached end of life in September 2024. Any future work on the search backend should also address the version upgrade path.

## Decision Drivers

- No sacrifice in search quality (fuzzy matching, prefix autocomplete, synonym expansion, BM25 ranking)
- Reduce hosted service cost (OpenSearch is the dominant line item)
- Support self-hosted users without forcing vendor dependencies
- Avoid vendor lock-in
- Enable locality/postcode autocomplete search alongside address search
- Minimise migration risk and effort

## Considered Options

1. **Retain OpenSearch (status quo)** — add locality/postcode index
2. **MongoDB Atlas Search** — same Lucene engine, bundled with database
3. **Typesense** — open-source, purpose-built for autocomplete/search
4. **SQLite FTS5** — embedded, zero-dependency search
5. **PostgreSQL full-text search** — pg_trgm + tsvector/tsquery
6. **Meilisearch** — open-source search engine

## Decision Outcome

**Option 1: Retain OpenSearch**, because it avoids migration risk, maintains identical search quality, and the locality/postcode search feature can be delivered immediately by adding a second index. Longer-term, the search layer should be designed to support pluggable backends (e.g., Typesense for cheaper hosted, SQLite FTS5 for zero-dependency self-hosted). OpenSearch Serverless was investigated and found to be significantly more expensive than the current managed domain due to minimum OCU charges, so it is not a viable cost reduction path.

### Consequences

#### Good

- Zero migration effort for existing address search
- Locality/postcode search can ship immediately using the same analyzer pipeline
- No risk of search quality regression

#### Neutral

- Cost remains higher than alternatives until backend abstraction is implemented
- Self-hosted users still need to run OpenSearch (status quo)

#### Bad

- Defers the cost saving — alternatives like Typesense or SQLite FTS5 would be significantly cheaper
- Does not yet improve the self-hosted experience

## Confirmation

- Locality/postcode search uses the same OpenSearch client and analyzer pipeline as address search
- No new infrastructure dependencies are introduced in this phase
- No backend abstraction layer exists yet; search calls go directly to the OpenSearch client in `client/elasticsearch.js` and `service/address-service.js`. The future abstraction is planned, not implemented.

## Pros and Cons of the Options

### Option 1: Retain OpenSearch

- Good: No migration risk, identical quality, immediate feature delivery
- Good: No vendor lock-in (open source, self-hostable)
- Bad: Highest ongoing cost among options; OpenSearch Serverless investigated and ruled out (minimum OCU charges exceed current managed domain cost)
- Bad: Heavy for self-hosted users (~1-2GB RAM)

### Option 2: MongoDB Atlas Search

- Good: Identical search quality (same Lucene engine, BM25 scoring)
- Good: Lower cost than OpenSearch (multiple pricing tiers available)
- Good: Natural document model fit for structured address data
- Bad: **Atlas-only** — not self-hostable, fails the self-hosted scenario entirely
- Bad: Introduces vendor lock-in to MongoDB Atlas

### Option 3: Typesense

- Good: Open source, self-hostable, lightweight (~300MB RAM)
- Good: Purpose-built for autocomplete with typo tolerance and synonyms
- Good: Significantly lower cost than OpenSearch when self-hosted
- Neutral: Comparable but not identical search quality (different ranking algorithm)
- Bad: Requires rewriting the search layer (queries, indexing, client)
- Bad: Introduces a new dependency for self-hosted users (though lighter than OpenSearch)

### Option 4: SQLite FTS5

- Good: Embedded — zero additional services for self-hosted users
- Good: Zero incremental cost for hosted service
- Good: Built-in BM25 ranking function
- Bad: No built-in fuzzy/typo tolerance (~85-90% quality vs OpenSearch)
- Bad: Synonym expansion requires application-level implementation
- Bad: Less battle-tested at 15M record scale for search workloads

### Option 5: PostgreSQL

- Good: Widely available, well understood, no vendor lock-in
- Good: Lower cost than OpenSearch on RDS
- Neutral: Fuzzy matching via pg_trgm uses trigram similarity (different from edit-distance fuzziness, ~90% quality)
- Bad: No existing RDS instance — would be a new service dependency
- Bad: Combining tsvector + pg_trgm + prefix matching is complex to tune
- Bad: Weaker relevance ranking than BM25

### Option 6: Meilisearch

- Good: Open source, self-hostable, excellent typo tolerance
- Good: Lower cost than OpenSearch (cloud or self-hosted)
- Neutral: Less control over ranking customisation than OpenSearch
- Bad: Requires rewriting the search layer
- Bad: Smaller ecosystem and community than OpenSearch or Typesense

## Reassessment Criteria

- Self-hosted user feedback indicates OpenSearch is a significant adoption barrier
- Typesense or SQLite FTS5 maturity reaches a point where migration risk is low
- OpenSearch 1.3.x end-of-life forces an upgrade decision (overlaps with ADR 002 reassessment)
- Search quality benchmarks demonstrate an alternative matches OpenSearch for address autocomplete
