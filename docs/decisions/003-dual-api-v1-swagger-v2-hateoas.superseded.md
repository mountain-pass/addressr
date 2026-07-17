---
status: superseded
date: 2022-01-01
superseded-by: 036-single-api-v2-waycharter-only
decision-makers: [Tom Howard]
consulted: []
informed: []
---

# ADR 003: Dual API Architecture (v1 Swagger + v2 WayCharter HATEOAS)

> **Superseded by [ADR 036](036-single-api-v2-waycharter-only.proposed.md) (proposed, pending ratification), 2026-07-17** — the dual-API architecture is retired in favour of a single v2 WayCharter API. The v1 Swagger surface (built on the abandoned `swagger-tools`) is dropped. This supersession was pre-authorised by ADR 003's own Reassessment Criteria ("Decision to deprecate v1 entirely"; "swagger-tools becoming a security liability"), both of which are now met (P030). ADR 036 is `proposed`/`human-oversight: unconfirmed`; if it is rejected at ratification this bookkeeping must be reverted.

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
