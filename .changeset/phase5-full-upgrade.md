---
"@mountainpass/addressr": major
---

BREAKING: Require Node.js >= 22 (previously >= 14)

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
