# @mountainpass/addressr

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
