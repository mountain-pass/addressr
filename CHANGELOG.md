# @mountainpass/addressr

## 2.1.2

### Patch Changes

- Add /api-docs endpoint returning OpenAPI 3.x spec

  Runtime endpoint that generates an OpenAPI spec from the registered
  WayCharter routes. Supplementary to the HATEOAS link-driven API.
  Enables automated RapidAPI sync via CI.

## 2.1.1

### Patch Changes

- b1e9ab1: Add postcode and state detail endpoints, make q optional on search
  - Add /postcodes/{postcode} detail endpoint with associated localities
  - Add /states/{abbreviation} detail endpoint with localities and postcodes
  - Make q parameter optional on /postcodes and /states (omit to list all)
  - Allow 0+ characters for q on postcode and state search

## 2.1.0

### Minor Changes

- 231a409: Add locality, postcode, and state search endpoints to the v2 HATEOAS API

  New endpoints discoverable from the root API:
  - `/localities?q=` — Search suburbs/localities by name (fuzzy + prefix matching)
  - `/postcodes?q=` — Search postcodes with associated localities
  - `/states?q=` — Search states by name or abbreviation

  Includes a new `addressr-localities` OpenSearch index populated during G-NAF loading, with postcodes derived from ADDRESS_DETAIL records for complete coverage.

## 2.0.4

### Patch Changes

- 724288c: Enable eslint-plugin-unicorn recommended rules and resolve all ESLint issues
  - Enable unicorn/prefer-global-this, prevent-abbreviations, filename-case, no-null, no-process-exit, prefer-spread, prefer-string-raw, require-module-specifiers, no-anonymous-default-export rules
  - Rename files to kebab-case (printVersion, setLinkOptions, waycharterServer)
  - Replace deprecated url.parse() with new URL()
  - Refactor nested promise chains to async/await in server entry points
  - Add .catch() handlers to controller promise chains
  - Add max-lines-per-function, max-depth, max-params lint rules
  - Resolve all ESLint errors and warnings (zero remaining, excluding intentional size guardrails)

## 2.0.3

### Patch Changes

- 5e0fd2d: Upgrade production dependencies (keyv v5, json-ptr v3, wait-port v1) and fix waychaser dependency (unpinned to ^5.0.50 after CJS output fix).

## 2.0.2

### Patch Changes

- 0420e18: Upgrade waycharter from v1 to v2 via new convenience API layer. No source code changes required — waycharter v2.0.30 provides a WayCharter convenience class matching the v1 API signatures.

## 2.0.1

### Patch Changes

- c1a4b83: Upgrade waychaser from v4 to v5, fix invoke parameter wrapping for v5 API, and bump to waychaser v5.0.44 for JSON pointer fragment resolution fix.

## 2.0.0

### Major Changes

- e5c57e9: BREAKING: Require Node.js >= 22 (previously >= 14)

  ### Breaking Changes
  - **Node.js engine requirement:** `>=14` to `>=22`. Consumers on Node 14-20 will get a post-install failure.

  ### Dependency Upgrades (Major Versions)
  - `@mountainpass/waycharter` pinned to v1 (v2 API migration deferred)
  - `@opensearch-project/opensearch` v2 to v3
  - `dotenv` v10 to v17
  - `glob` v7 to v13 (removed `glob-promise`)
  - `keyv` v4 to v5, `keyv-file` v0.2 to v5
  - `http-link-header` pinned to ^1.1.3
  - Replace `got` with native `fetch`

  ### Dev Dependency Upgrades (Major Versions)
  - `@mountainpass/waychaser` pinned to v4 (v5 API migration deferred)
  - `@cucumber/cucumber` v5 to v12
  - `eslint` v7 to v9 (migrated to flat config)
  - `nodemon` v2 to v3
  - `babel-plugin-istanbul` v6 to v7
  - Replaced `babel-eslint` with `@babel/eslint-parser`
  - Replaced `eslint-plugin-node` with `eslint-plugin-n`
  - Replaced `eslint-plugin-import` with `eslint-plugin-import-x`
  - Removed `ngrok`, `babel-preset-env`, `glob-promise`, `got`

  ### Bug Fixes
  - Fix OpenSearch health check URL in CI
  - Fix `statusCode` propagation in REST driver
  - Fix `link-template` header `var-base` attribute decoding

  ### CI/CD
  - GitHub Actions upgraded from v3 to v5
  - OpenSearch tests now run via GitHub Actions service container
  - Full test suite runs in both PR and release pipelines

## 1.1.8

### Patch Changes

- 05c79c6: Upgrade ESLint plugins, nodemon v2 to v3, js-yaml v3 to v4
  - Update ESLint plugins and parser (@babel/eslint-parser, eslint-plugin-n, etc.)
  - Upgrade nodemon ^2 to ^3 (dev tooling)
  - Upgrade js-yaml ^3 to ^4 (YAML parsing)
  - Interim step before ESLint 9 flat config migration in Phase 5

## 1.1.7

### Patch Changes

- 1431e75: Upgrade Prettier v2 to v3 and reformat codebase
  - Trailing commas now required (Prettier 3 default)
  - Codebase reformatted for consistency

## 1.1.6

### Patch Changes

- 8aff9a8: Upgrade husky v7 to v9 and lint-staged v11 to v15
  - Migrate from package.json hooks to `.husky/` shell scripts
  - Add `prepare` script for husky v9 initialization

## 1.1.5

### Patch Changes

- 51d13ed: Baseline npm dependency updates within existing caret ranges
  - Update dependencies to latest semver-compatible versions
  - Add dry-aged-deps maturity checks
  - Add build-and-test CI job with OpenSearch service container

## 1.1.4

### Patch Changes

- b12052d: Add deployment safety controls and v2 API test coverage
  - Add `/health` HATEOAS endpoint to v2 API (linked from root, returns status + version)
  - Add `test:rest2:nogeo` to CI pipeline (v2 API now tested in CI)
  - Enable rolling deployment with automatic rollback
  - Add post-deploy smoke tests to release workflow
  - Remove broken `ngrok` devDependency

## 1.1.3

### Patch Changes

- 31a9237: build(deps-dev): bump @babel/traverse from 7.14.5 to 7.25.6
- 779aa71: updated node.js and opensearch versions
- c66bc7a: build(deps): bump cookie and express

## 1.1.2

### Patch Changes

- c3b45b3: build(deps): bump express from 4.17.1 to 4.19.2

## 1.1.1

### Patch Changes

- 056a00c: Updated SaaS node.js to 18.x

## 1.1.0

### Minor Changes

- 38bef8f: To enable Cross-Origin Resource Sharing (CORS), you can use the `ADDRESSR_ACCESS_CONTROL_ALLOW_HEADERS` environment variable to control the `Access-Control-Allow-Headers` header. If `ADDRESSR_ACCESS_CONTROL_ALLOW_HEADERS` is not set, the header will not be returned. If it is set, the header will be returned with the value of the `ADDRESSR_ACCESS_CONTROL_ALLOW_HEADERS` environment variable.
