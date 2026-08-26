# @mountainpass/addressr-mcp

## 1.0.4

### Patch Changes

- 4da99ff: Add pre-commit `scripts/check-em-dashes.sh` wired into `lint-staged` `*.md` block. Greps each staged markdown file for U+2014 (em-dash), prints `<file>:<lineno>:<content>` to stderr per match, and fails the commit with exit 1 when any match is found. Override with `git commit --no-verify` when intentional (e.g., quoted external text). `docs/problems/README-history.md` is skipped to preserve the forward-chronology archive of pre-hook prose. Closes P008.

## 1.0.3

### Patch Changes

- e271601: docs: add "How It Works" section to README explaining the proxy / on-demand-fetch context model

  Adopters can now answer "how does this stay cheap with 13 million addresses?" from the README alone, without needing to inspect `src/server.mjs`. The new section names the proxy model, lists what enters the AI client's context (tool schemas at session start plus matched results per call), and walks one concrete `search-addresses` to `get-address` flow.

  Closes P004.

## 1.0.2

### Patch Changes

- 1e93639: Upgrade `eslint` and `@eslint/js` from v9 → v10 (major). Existing flat-config in `eslint.config.js` (uses `js.configs.recommended` + `eslint-config-prettier`) is fully compatible with no changes; lint and tests pass clean. Dev-dep only — no impact on the published package or runtime behaviour.

## 1.0.1

### Patch Changes

- 0da3803: Fix integration test target: `test/server.test.mjs` now exercises the local MCP server end-to-end via `StdioClientTransport` (spawning `node src/server.mjs`) instead of the upstream RapidAPI-hosted aggregator. Assertions cover our kebab-case tool surface (`search-addresses`, `get-address`, `search-localities`, `get-locality`, `search-postcodes`, `get-postcode`, `search-states`, `get-state`, `health`) and our `{status, headers, body}` envelope shape. The suite skips cleanly when neither `RAPIDAPI_KEY` nor `ADDRESSR_RAPIDAPI_KEY` is set. Default `npm test` is restored to run unit + integration (`npm run test:unit && npm run test:integration`); keyless runs (CI without secrets, contributors without 1Password) still get full unit-suite signal, and keyed runs add live-API verification of the proxy.
- 06202e9: Update dev dependencies within existing semver ranges via `dry-aged-deps`: `@changesets/cli` 2.30.0 → 2.31.0, `globals` 17.4.0 → 17.5.0, `prettier` 3.8.1 → 3.8.3. No runtime impact (dev tooling only); lint and tests pass.

## 1.0.0

### Major Changes

- c6da43d: feat!: HATEOAS-native tool contracts (breaking change)

  Detail tools now accept a canonical `url` parameter instead of a resource ID, and all tools return a `{status, headers, body}` envelope. The `headers.link` field is parsed into `[{uri, rel, anchor?, title?}]` so MCP consumers can follow canonical and pagination links directly.

  Breaking changes:
  - `get-address` parameter renamed from `addressId` to `url` — pass the full canonical URL, e.g. `https://addressr.p.rapidapi.com/addresses/GANSW710280564`.
  - `get-locality` parameter renamed from `localityId` to `url`.
  - `get-postcode` parameter renamed from `postcode` to `url`.
  - `get-state` parameter renamed from `stateAbbreviation` to `url`.
  - All tool responses are now `{status, headers, body}` envelopes. The raw upstream JSON is on `body`; callers that used to consume the response as the JSON object directly must now read `.body`.

  Migration: after a `search-*` call, read a `rel=canonical` link from `headers.link` and pass its `uri` to the matching `get-*` tool.

  Also in this release:
  - `ADDRESSR_RAPIDAPI_KEY` is now the preferred environment variable name; `RAPIDAPI_KEY` continues to work as a fallback.
  - New README "Key Safety" section covering safer alternatives to pasting the raw key into MCP client configs.

  See ADR-003 for the architectural decision.

### Minor Changes

- d344a6a: feat: dynamic tool discovery from Addressr API root

  The MCP server now dynamically discovers and registers tools based on the link relations advertised by the Addressr API root response. This exposes three new MCP tools:
  - `search-localities` — search Australian suburbs/localities
  - `search-postcodes` — search Australian postcodes
  - `search-states` — search Australian states and territories

  A static `REL_TO_TOOL` mapping maps known link relation URIs to tool definitions. The server fetches the API root at startup and registers a tool for each advertised relation. If the API root is unreachable, the server falls back to registering only `health` and `get-address`.

  See ADR-002 for the architectural decision.

## 0.2.0

### Minor Changes

- 853149c: Initial release of the Addressr MCP server. Provides three tools for Australian address search and validation via RapidAPI: search-addresses, get-address, and health.
