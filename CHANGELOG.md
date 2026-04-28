# @mountainpass/addressr

## 2.4.1

### Patch Changes

- 3036278: Infrastructure: provision parallel v2 OpenSearch domain (ADR 029 Phase 1 step 4).

  No user-visible change. Standalone `terraform apply` that creates `module.opensearch_v2.aws_opensearch_domain.this` (engine `OpenSearch_2.19`, instance `t3.small.search`) alongside the existing `search-addressr3-…` domain. The existing domain is untouched throughout Phase 1; production continues serving from v1 until the cutover commit lands at step 7.

  Both v1 and v2 use the same fine-grained-access master credentials (per the credential reuse decision in commit `c160621`'s rationale). After this deploy completes, the operator runs `bash scripts/copy-v2-secrets.sh` to populate the V2-named GHA secrets (step 4a), then triggers `populate-search-domain.yml` workflow_dispatch (step 5).

  Refs: P028, ADR 029 (proposed), ADR 030 (proposed).

## 2.4.0

### Minor Changes

- 920fce6: feat(search): sharper number matching and correct range semantics (ADR 027 + ADR 028)

  v2.4.0 ships two complementary search-quality fixes that close the remaining gaps in [#367](https://github.com/mountain-pass/addressr/issues/367) reporter `hirani89`'s 2022 cases.

  **ADR 027 — numeric fuzziness removed** (`fuzziness: 'AUTO'` → `'AUTO:5,8'`). Under the previous default, 3-4 digit tokens (street numbers, postcodes) allowed 1-char edit distance, so `138 Whitehorse Rd` ranked `135-137 WHITEHORSE RD` ahead of the target `138-144 WHITEHORSE RD` via term-frequency inflation on adjacent fuzzy numbers. Under `AUTO:5,8`, numeric tokens require exact match. 5+ character typo tolerance on street/locality names is preserved (`Muray`→`MURRAY` still works).

  **ADR 028 — range addresses use endpoint-only expansion** (supersedes ADR 026). Under the previous full-interpolation shipped briefly in v2.3.0, a G-NAF range like `103-107 GAZE RD` emitted five aliases (103, 104, 105, 106, 107). This produced false positives: under Australian addressing convention, `104` and `106` belong to the opposite side of the street, and `105` may be a separate property. ADR 028 emits exactly two aliases (the first and last G-NAF endpoints). Mid-range queries no longer resolve to the range doc.

  **Consumer-visible impact**:
  - `"495 Maroondah Hwy Ringwood"` → `495-503 MAROONDAH HWY` at position 1.
  - `"138 Whitehorse Rd Blackburn"` → `138-144 WHITEHORSE RD` at position 1 (was 3).
  - `"225 drummond st carlton"` → `TRAVEL INN HOTEL, 225-245 DRUMMOND ST` at position 1 (was 6).
  - Mid-range queries (e.g. `"104 GAZE RD"`) no longer falsely return range docs whose `NUMBER_FIRST`/`NUMBER_LAST` bracket the number — they return only the actual non-range doc at that number (if one exists).
  - Queries with specific street numbers produce sharper, less-noisy result lists. Adjacent-number fuzzy noise is filtered out.

  **Correction framing**: v2.3.0 shipped ADR 026 with interpolation for a brief window. Post-deploy smoke revealed the false-positive defect; v2.4.0 corrects it. Consumers who built against v2.3.0 will see mid-range queries return fewer results — this is a correctness fix, not a regression.

  **Implementation**:
  - `service/address-service.js` — `fuzziness: 'AUTO'` → `'AUTO:5,8'`. No query shape change.
  - `service/range-expansion.js` — `expandRangeAliases(first, last, ...)` emits `[firstAlias, lastAlias]` only. `SPAN_CAP` retired (no longer needed; always 2 aliases). Index storage drops vs v2.3.0.
  - ADR 025 summation-symmetry invariant preserved (bool_prefix field list and clause shape unchanged).
  - ADR 028's `sla_range_expanded` field remains confined to the `phrase_prefix` clause; `tie_breaker=0.0` invariant preserved.
  - Reindex on deploy picks up the endpoint-only aliases via the existing loader pipeline. No new operational step.

  Resolves the ranking and correctness halves of [#367](https://github.com/mountain-pass/addressr/issues/367) ([P026](../docs/problems/026-numeric-fuzziness-inflates-ranking.open.md) + supersedes ADR 026). See ADR 027 and ADR 028.

## 2.3.0

### Minor Changes

- ecf836a: feat(address-service): range-number addresses findable by any in-range number (ADR 026)

  G-NAF range-numbered addresses (e.g. `103-107 GAZE RD, CHRISTMAS ISLAND OT 6798`) are now searchable by any number in the documented range, not just the canonical hyphenated form. Queries like `"104 GAZE RD"` that previously returned zero results now return the range address. Roughly 7.5% of all Australian addresses are range-numbered; in dense urban states (NSW, QLD, VIC) the figure approaches 10%.

  **Consumer-visible impact**: `GET /addresses?q=<mid-range-number> <street> <locality>` now returns the range document in the result list where it was previously absent. Non-range exact matches for the same number continue to rank at or above range documents (BM25 field-length normalisation + best_fields max). Canonical hyphenated-form queries (`"103-107 GAZE RD"`) are unaffected.

  **Implementation**: new `sla_range_expanded` multi-valued text field populated asymmetrically on range docs only (span cap 20 excludes data-quality outliers). Added only to the `phrase_prefix` clause of `searchForAddress`, leaving the `bool_prefix` clause unchanged so ADR 025's summation-symmetry property is preserved. Indexed field populates on next deploy reindex.

  Resolves [#367](https://github.com/mountain-pass/addressr/issues/367) (covers reporter's `495 Maroondah Hwy`, `138 Whitehorse Rd`, and `225 Drummond St` cases). See ADR 026 and P015.

### Patch Changes

- fda4e3b: fix(address-service): invalid address ID returns 404 not 500

  `GET /addresses/<invalid-id>` now returns `404 Not Found` as documented, instead of `500 Internal Server Error`. The `getAddress` catch block in `service/address-service.js` previously dereferenced `error_.body.found` and `error_.body.error.type` without guarding `error_.body` — on non-OpenSearch errors (network timeouts, connection refused) `error_.body` is `undefined`, so the catch block itself threw a `TypeError` and the request fell through to a generic 500.

  **Consumer-visible impact**: API consumers can now reliably distinguish a missing address (404) from a backend fault (500) or a missing index (503). Request timeouts now map to `504 Gateway Timeout`, matching the sibling `getAddresses` search endpoint. Response bodies unchanged; only HTTP status codes are affected.

  Fixes [#95](https://github.com/mountain-pass/addressr/issues/95) and [#81](https://github.com/mountain-pass/addressr/issues/81). See P014.

## 2.2.0

### Minor Changes

- d8357f1: fix(search): rank exact street address above sub-unit variants

  Search queries for a street address that also has sub-unit variants (SHOP, UNIT, FLAT, LEVEL) indexed now return the exact street-level record as the top result, not a sub-unit. Fixes a BM25 scoring asymmetry where sub-unit documents matched the query in both `sla` and `ssla` index fields while street-level documents matched only `sla`, causing sub-units to score roughly double. The fix populates `ssla` symmetrically on every indexed address (equal to `sla` when there is no sub-unit) so per-field score summation is balanced across documents. See ADR 025.

  **Consumer-visible impact**: the first result of `/addresses?q=<street-address>` changes for queries whose address has indexed sub-units. BM25 `score` numeric values in API responses also shift across most queries because every document now populates the `ssla` field. **This is expected and not a breaking contract change** — absolute score thresholds are not part of the API contract and may need re-baselining. The first result is still the best match by score. API shape is unchanged: `ssla` was already an optional field on the address schema, it is simply populated on more records.

  Fixes https://github.com/tompahoward/addressr/issues/375. Closes P007.

## 2.1.5

### Patch Changes

- 56dbb81: chore(prod): activate ADR 024 gateway auth enforcement in Mountain Pass production

  Triggers a Terraform re-apply on the `addressr-prod` workspace so the two `ADDRESSR_PROXY_AUTH_*` EB env vars are set from the newly-configured GitHub Actions repo secrets. Application code is unchanged from v2.1.4 — this release exists only to pick up the new TF_VAR values. Self-hosted consumers are unaffected.

  Post-deploy, the direct-bypass smoke probe should flip from 200 to 401. Rollback: delete the two repo secrets and cut another patch release.

## 2.1.4

### Patch Changes

- e7c9c37: feat(origin): opt-in gateway auth header enforcement (ADR 024, P009)

  Adds `ADDRESSR_PROXY_AUTH_HEADER` and `ADDRESSR_PROXY_AUTH_VALUE` env vars. Both unset (default) keeps current behaviour — self-hosted npm and Docker deployments are unaffected. Set both to reject requests that do not present the configured header; `/health` and `/api-docs` remain allowlisted so monitors and gateway OpenAPI imports keep working. Setting exactly one fails startup to prevent silent bypass.

## 2.1.3

### Patch Changes

- ad2e5c0: Add comprehensive schemas and examples to /api-docs OpenAPI spec

  The spec now includes:
  - Full response schemas with `$ref` to reusable components
  - Example values for all parameters
  - Example response bodies
  - Operation descriptions and tags for organization
  - Server URL hint for RapidAPI

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
