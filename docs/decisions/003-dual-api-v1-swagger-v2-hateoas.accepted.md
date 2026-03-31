---
status: accepted
date: 2022-01-01
decision-makers: [Tom Howard]
consulted: []
informed: []
---

# ADR 003: Dual API Architecture (v1 Swagger + v2 WayCharter HATEOAS)

## Context and Problem Statement

Addressr started with a Swagger/OpenAPI-based REST API (v1). A HATEOAS-based API (v2) was added using the WayCharter library for link-driven API navigation. Both APIs share the same service layer and OpenSearch backend.

## Decision Drivers

- HATEOAS enables self-describing, discoverable APIs
- Existing v1 consumers should not be broken
- WayCharter/WayChaser are Mountain Pass's own libraries

## Considered Options

1. **Dual API: v1 (swagger-tools) + v2 (WayCharter HATEOAS)** -- ship both, deploy v2
2. **Replace v1 with v2** -- remove swagger-tools, only ship HATEOAS API
3. **GraphQL** -- replace both with a GraphQL endpoint

## Decision Outcome

**Option 1: Dual API.** Both APIs are packaged in the npm module (`addressr-server` for v1, `addressr-server-2` for v2). Production deploys v2 only (`deploy/deploy.sh` starts `addressr-server-2`).

### Consequences

- Good: v2 API is self-describing with link relations
- Good: v1 remains available for self-hosted consumers who depend on it
- Bad: Two server binaries must be maintained
- Bad: v1 uses `swagger-tools` which appears unmaintained
- Bad: CI tests v1 API paths but not v2 (critical gap)

### Confirmation

- `package.json` bin entries: `addressr-server` (v1), `addressr-server-2` (v2)
- `deploy/deploy.sh` line 22: `"start": "addressr-server-2"`
- `src/waycharterServer.js` implements the v2 HATEOAS API

### Reassessment Criteria

- Decision to deprecate v1 entirely
- `swagger-tools` becoming a security liability
- npm package size concerns from shipping unused v1 code
