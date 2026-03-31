---
status: accepted
date: 2021-01-01
decision-makers: [Tom Howard]
consulted: []
informed: []
---

# ADR 002: OpenSearch as the Search Engine

## Context and Problem Statement

Addressr needs a full-text search engine to index and query Australian addresses from the G-NAF dataset. The engine must support custom analyzers (synonym expansion, comma-stripping tokenization) and handle bulk indexing of millions of address records.

## Decision Drivers

- Full-text search with custom analyzers for address matching
- Bulk indexing performance for G-NAF datasets
- Open-source licensing (Elasticsearch changed to SSPL in 2021)
- AWS managed service availability

## Considered Options

1. **OpenSearch** -- AWS-backed fork of Elasticsearch, Apache 2.0 licensed
2. **Elasticsearch** -- Original search engine, SSPL licensed since 7.11
3. **PostgreSQL full-text search** -- Built into PostgreSQL, no additional infrastructure

## Decision Outcome

**Option 1: OpenSearch.** Pinned to OpenSearch 1.3.x (API-compatible with Elasticsearch 7.10.2). Uses `@opensearch-project/opensearch` npm client. Deployed as AWS OpenSearch Service in ap-southeast-2.

Note: codebase retains Elasticsearch naming throughout (file `client/elasticsearch.js`, env vars `ELASTIC_*`, debug channel `es`). This is historical -- the project predates the OpenSearch fork.

### Consequences

- Good: Open-source Apache 2.0 license, no vendor lock-in concerns
- Good: AWS managed service reduces operational burden
- Neutral: Pinned to 1.3.x (old release line; current is 2.x+)
- Bad: Naming mismatch causes confusion (files say "elasticsearch", runtime is OpenSearch)

### Confirmation

- `package.json` lists `@opensearch-project/opensearch` as a production dependency
- CI service container runs `opensearchproject/opensearch:1.3.20`
- Production runs AWS OpenSearch Service 1.3

### Reassessment Criteria

- OpenSearch 1.3.x reaching end of life
- Need for features only available in OpenSearch 2.x+
- Performance limitations with the current custom analyzer
