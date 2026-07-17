---
human-oversight: confirmed
oversight-date: 2026-07-18
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

> **Amendment 2026-07-11 (ADR 029 step 10 downstream)** — the OpenSearch **engine version is now pinned to 2.19** after the ADR 029 blue/green upgrade completed (v2 `addressr4` cut over 2026-07-10, v1 `addressr3` decommissioned 2026-07-11). Confirmation is now: `package.json config.SEARCH_IMAGE` = `opensearchproject/opensearch:2.19.5`, CI service container + devcontainer run 2.19.5, production runs AWS OpenSearch Service 2.19. The engine choice (OpenSearch) is unchanged; only the version moved off the EOL 1.3.x line.

> **Amendment 2026-07-14 (ADR 035 downstream)** — the engine version is now **OpenSearch 3.5** after ADR 029 Phase 2 completed ([ADR 035](035-opensearch-3-5-upgrade-2-19-ci-regression.accepted.md), accepted). Production runs AWS OpenSearch Service 3.5 (`deploy/vars.tf` `elastic_v3_engine_version = "OpenSearch_3.5"`); CI retains 2.19 as a regression/compatibility leg per ADR 035. The `Neutral: Pinned to 1.3.x` / `Production runs AWS OpenSearch Service 1.3` lines above are historical — superseded by this and the 2026-07-11 amendment. The engine choice (OpenSearch) is unchanged.

### Reassessment Criteria

- OpenSearch 1.3.x reaching end of life
- Need for features only available in OpenSearch 2.x+
- Performance limitations with the current custom analyzer
