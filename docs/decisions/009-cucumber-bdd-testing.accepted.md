---
status: accepted
date: 2019-01-01
decision-makers: [Tom Howard]
consulted: []
informed: []
---

# ADR 009: Cucumber.js for BDD Acceptance Testing

## Context and Problem Statement

The project needs acceptance tests that verify the API behaves correctly across multiple deployment modes (embedded, HTTP server, CLI binary) and with/without geocoding.

## Decision Drivers

- Behavior-driven development with human-readable scenarios
- Multi-profile testing (embedded, REST v1, REST v2, CLI v1, CLI v2)
- Geo and non-geo test variants
- Shared step definitions across profiles

## Considered Options

1. **Cucumber.js** -- BDD with Gherkin feature files
2. **Jest** -- unit/integration testing framework
3. **Mocha + Chai** -- flexible test runner with assertions

## Decision Outcome

**Option 1: Cucumber.js** with 5 test profiles (default/nodejs, rest, rest2, cli, cli2), each with geo/non-geo variants. 29 scenarios across 5 feature files. Tests require a running OpenSearch instance.

Test architecture: shared step definitions in `test/js/steps.js`, profile-specific drivers in `test/js/drivers/`, OpenSearch setup in `test/js/world.js`.

### Consequences

- Good: Human-readable scenarios serve as living documentation
- Good: Multi-layer testing catches deployment-specific issues
- Good: Shared step definitions reduce duplication
- Bad: Complex test configuration (5 profiles x 2 geo modes = 10 combinations)
- Bad: CI only runs 3 of 10 combinations (`test:nogeo` = nodejs + rest + cli)
- Bad: v2 API tests (rest2) are NOT in CI despite v2 being the production API

### Confirmation

- `cucumber.js` config generates profiles
- `test/resources/features/` contains 5 .feature files
- `test:nogeo` runs nodejs, rest, cli profiles in CI

### Reassessment Criteria

- Test execution time becoming a bottleneck
- Desire to simplify the test matrix
- Need to add v2 tests to CI (critical gap — see ADR 003)
