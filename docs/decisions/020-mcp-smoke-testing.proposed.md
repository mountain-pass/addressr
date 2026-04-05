---
status: proposed
date: 2026-04-05
decision-makers: [Tom Howard]
consulted: []
informed: []
---

# ADR 020: MCP Smoke Tests via RapidAPI

## Context and Problem Statement

RapidAPI auto-exposes addressr's REST endpoints as MCP (Model Context Protocol) tools at `mcp.rapidapi.com`. AI agents and LLM clients can discover and call these tools using the MCP SDK. We need to verify that the MCP integration works correctly -- that tools are discoverable, address search returns results, and address detail retrieval functions properly.

The existing Cucumber BDD test infrastructure (ADR 009) assumes local OpenSearch, G-NAF data, and local servers. MCP smoke tests hit an external service (RapidAPI's hosted MCP server) and have none of these dependencies, making the Cucumber harness unsuitable.

## Decision Drivers

- MCP smoke tests require only a `RAPIDAPI_KEY`, not local infrastructure
- Cucumber's `world.js` BeforeAll unconditionally starts local servers and connects to OpenSearch
- Tests must be opt-in -- they cannot run without a RapidAPI key
- The `@modelcontextprotocol/sdk` is ESM-only, incompatible with the project's CJS/Babel setup (ADR 005)

## Considered Options

1. **Standalone `.mjs` test files with `node:test`** -- native ESM, no Babel, opt-in npm script
2. **New Cucumber profile** -- add an `mcp` profile with a dedicated driver
3. **Shell-based smoke tests** -- extend the existing curl pattern in CI

## Decision Outcome

**Option 1: Standalone `.mjs` test files with `node:test`.** Tests live in `test/mcp/` and run via `npm run test:mcp:smoke`. They are not included in the standard `test:nogeo` pipeline.

The `.mjs` extension provides native ESM support without Babel, resolving the CJS/ESM interop issues with the MCP SDK. The `node:test` runner is built into Node 22 (the project's CI version) and requires no additional test framework.

### Consequences

- Good: No dependency on local infrastructure (OpenSearch, G-NAF, local servers)
- Good: Clean ESM support via `.mjs` without touching the Babel pipeline
- Good: Opt-in -- cannot break CI when `RAPIDAPI_KEY` is absent
- Good: Validates the RapidAPI MCP distribution channel (strengthens ADR 017)
- Bad: Diverges from Cucumber BDD pattern (ADR 009) for this test category
- Bad: `.mjs` files are outside the current ESLint/lint-staged scope (ADR 014 targets `*.{js,jsx}`)
- Bad: External service dependency -- tests can fail due to RapidAPI outages

### Confirmation

- `npm run test:mcp:smoke` passes with `RAPIDAPI_KEY` set
- Tests skip gracefully when `RAPIDAPI_KEY` is absent
- Tool discovery returns addressr-related MCP tools
- Address search and detail retrieval return expected data structures

### Reassessment Criteria

- RapidAPI changes their MCP server URL or authentication method
- The project migrates to native ESM (ADR 005 superseded) -- `.mjs` workaround becomes unnecessary
- MCP becomes a primary distribution channel requiring deeper integration tests
