---
human-oversight: confirmed
oversight-date: 2026-07-18
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

**Option 1: Cucumber.js** with 5 test profiles (default/nodejs, rest, rest2, cli, cli2), each with geo/non-geo variants. 29 scenarios across 5 feature files. Tests require a running OpenSearch instance. _(As written in 2019. See the 2026-08-09 amendment below: three profiles, nine feature files.)_

Test architecture: shared step definitions in `test/js/steps.js`, profile-specific drivers in `test/js/drivers/`, OpenSearch setup in `test/js/world.js`.

### Consequences

- Good: Human-readable scenarios serve as living documentation
- Good: Multi-layer testing catches deployment-specific issues
- Good: Shared step definitions reduce duplication
- Bad: Complex test configuration (5 profiles x 2 geo modes = 10 combinations) _(now 3 x 2 = 6 — see amendment)_
- Bad: CI only runs 3 of 10 combinations (`test:nogeo` = nodejs + rest + cli) _(now 5 of 6 — see amendment)_
- Bad: v2 API tests (rest2) are NOT in CI despite v2 being the production API _(**no longer true** — `test:nogeo` runs `test:rest2:nogeo`; see amendment)_

### Confirmation

- `cucumber.js` config generates profiles
- `test/resources/features/` contains the v2 feature set _(a bare count was the original criterion and it rotted — five when written, nine on 2026-08-09. Deliberately non-numeric now: a number here is a criterion that goes false on every feature added, which is how this section came to assert something untrue for years.)_
- `test:nogeo` runs nodejs, rest2, cli2 profiles in CI _(corrected 2026-08-09; the v1 `rest`/`cli` profiles were removed by ADR-036)_

### Reassessment Criteria

- Test execution time becoming a bottleneck
- Desire to simplify the test matrix
- ~~Need to add v2 tests to CI (critical gap — see ADR 003)~~ — **DISCHARGED 2026-08-09.** `test:nogeo` runs `test:rest2:nogeo`, so the v2 API is in CI. Left struck rather than deleted because it also cited ADR-003, which ADR-036 superseded; a live trigger pointing at a retired decision for a closed gap would have fired wrongly at the next reassessment.

## Amendment 2026-08-09 — the profile map this ADR describes is seven years stale (P094)

Recorded because a decision record asserting coverage it does not have is the expensive failure, and four of this ADR's statements about CI were false against the tree.

**The Decision Drivers at the top are deliberately left as written.** They name "embedded, REST v1, REST v2, CLI v1, CLI v2" — the 2019 reasoning, and correcting it would falsify the record of why this was decided. What follows corrects the sections that assert things about the tree as it is now.

**Three profiles, not five.** `cucumber.js` exports `default` (nodejs), `rest2` and `cli2`. The v1 `rest` and `cli` profiles went with the v1 API under [ADR-036](036-single-api-v2-waycharter-only.proposed.md). So the combination space is 3 x 2 = 6, not 5 x 2 = 10.

**Nine feature files, not five.** The "29 scenarios across 5 feature files" figure describes 2019.

**CI runs five of the six.** `test:nogeo` runs all three no-geo tiers; `test:geo` runs `test:nodejs:geo` and, since 2026-08-09, `test:cli2:geo`. The one that remains unwired is `test:rest2:geo` — see below.

**The rest2-not-in-CI consequence is discharged.** `test:nogeo` runs `test:rest2:nogeo`, so the v2 API is exercised in CI.

### `test:rest2:geo` is deliberately unwired, and this is the record of that

It is declared and reachable from no chain — the same shape P094 was filed for, one script over, which is why it is being written down rather than left to be rediscovered.

It stays unwired because the marginal coverage does not justify a third full geo load per matrix leg. `@geo` occurs **once** in the entire feature set (`test/resources/features/addressv2.feature:311`), and that single scenario is already exercised by both wired geo legs. What a geo leg genuinely buys is the **loader executing its geo branch**, which `test:nodejs:geo` covers from source and `test:cli2:geo` covers from the published package — the configuration production runs. A rest2 geo leg would re-run the same one assertion against the same loader output through a third transport.

Reassess if `@geo` grows beyond one scenario, or if a transport-specific geo defect is ever observed.

### `test:nodejs:QLD:nogeo` and `test:nodejs:QLD:geo` are deliberately manual

Same shape, recorded for the same reason: both are declared, reachable from no chain, and were documented nowhere until the reachability guard in `test/js/__tests__/npm-script-contracts.test.mjs` demanded it. They are a developer-invoked **scale probe** — a full state rather than the OT fixture, wanting roughly 8 GiB — used to exercise ranking behaviour against a realistic corpus. Only the geo variant declares a raised heap (`--max_old_space_size=8196`); the nogeo one declares none, which is either correct for the lighter load or an under-provisioning nobody has hit — worth settling if either is ever wired, and noted here rather than smoothed over, since this amendment exists because statements about the tree should be true of it. That is a different job from a CI tier, which needs to be fast and deterministic, so wiring them would trade the thing CI is for.

Reassess if either is wired into a chain, or if the OT fixture stops being representative enough to catch ranking regressions.
