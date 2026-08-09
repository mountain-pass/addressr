# Problem 094: The configuration production actually runs — published package with geo enabled — is tested by nothing

**Status**: Closed
**Reported**: 2026-08-08
**Priority**: 8 (Medium) — Impact: Significant (4) × Likelihood: Unlikely (2). Impact 4: a defect reachable only on this pair reaches the live API and the loader that writes the index; per `RISK-POLICY.md` that is "installs or starts but fails for a subset of operations". Likelihood 2: the two axes are covered separately and the module graph is shared, so the residue is narrow — see Root Cause.
**Origin**: internal — surfaced by the risk gate during the native-ESM migration (ADR-044)
**Effort**: M — the script exists but is unverified and carries two defects; wiring it also needs a CI-cost decision
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

Production runs the loader with `ADDRESSR_ENABLE_GEO=1` against the **published package** — that is what `deploy/main.tf` and the manifest `deploy/deploy.sh` generates set up. No test covers that pair:

| test              | package or source?                               | geo?                                   |
| ----------------- | ------------------------------------------------ | -------------------------------------- |
| `test:nodejs:geo` | source                                           | yes                                    |
| `test:cli2:nogeo` | published package (`npm pack && npm install -g`) | no                                     |
| `test:cli2:geo`   | published package                                | yes — **and it is in no script chain** |

`test:geo` runs only `test:nodejs:geo`. So each axis is covered alone and the diagonal is not covered at all.

## Symptoms

None observed. This is a coverage gap, not a live defect — filed because it was found by reasoning about the ADR-044 migration's blast radius rather than by anything failing, and a gap nobody wrote down is a gap nobody closes.

## Root Cause Analysis

Two things kept it invisible.

**The pair was cheap to cover before it wasn't.** Until ADR-044 the published package was the Babel build output, `files` listed `lib/`, and `babel . -d lib` compiled the entire tree into it — so "is the module in the package?" could not be answered wrongly, because everything was. With `files` now an explicit list of source directories, a module reachable only on the geo branch could legitimately be missing.

**And `test:cli2:geo` looks like coverage.** It exists, it is correctly named, and it is complete. A reader scanning `package.json` would reasonably conclude the pair is tested. It is reachable from no chain, which is [P033](../open/033-source-inspection-tests-anti-pattern.md)'s reviewer-trap shape wearing an npm script instead of a test name.

### The residue is narrower than the table suggests

Worth stating precisely, because it is why this is Priority 8 and not higher, and why the interim mitigation below is adequate rather than a fudge.

`service/address-service.js` carries both the geo and no-geo branches in one module, and that module's entire static import graph is already resolved from the tarball by `test:cli2:nogeo`. Geo **data** comes from the G-NAF dataset, not from files inside the package. So the way this gap can actually bite reduces to: _a module reachable only on the geo branch is absent from the tarball_.

That is a static property, and it is now pinned — `test/js/__tests__/package-graph-ships.test.mjs` resolves the import graph from every published entry point with esbuild and asserts every local module it reaches is covered by a `files` entry. Mutation-proved by dropping `utils/`, `client/` and `version.js` from `files` in turn; each fails.

**That is a mitigation, not the fix.** It cannot see a runtime asset read, a dynamic import built from a variable, or a geo-only behavioural regression that has nothing to do with packaging.

### Investigation Tasks

- [x] Fix the two defects in the unwired script before trusting it. `pretest:cli2:geo` and `test:cli2:geo` use `ES_INDEX_NAME=test`, while every other geo leg uses `test-geo` — wiring it in after `test:cli2:nogeo` would load geo data over the nogeo leg's index. And `pretest:cli2:geo` carries no `NODE_OPTIONS`, unlike its packaged-geo sibling `start:loader:packaged:geo`. Immaterial at OT-fixture scale, but it is drift, and it is evidence that an in-no-chain script rots rather than sitting inert.
- [x] Decide where it runs, and cost it honestly: geo indexing is slow and wants ~8GiB.
- [x] Wire it, and confirm the index-name fix by checking the nogeo leg still passes when the two run in sequence.

## The engines question — SETTLED 2026-08-08, the floor is honest

Measured, not inferred. `npm pack` → `npm i -g` inside `node:22.7-slim` → `import()` of the installed package's `src/waycharter-server.js`: **resolves cleanly**, returning `buildRest2App, forceCloseConnections, startRest2Server, stopServer`. The whole shipped graph — the OpenSearch client, waycharter, express — loads on 22.7.

So `engines: ">=22"` is accurate for the shipped path, and a consumer on 22.0-22.11 is not exposed. What needs 22.12 is the **test harness only**: `@cucumber/cucumber`'s CJS `argv_parser.js` `require()`s ESM `@cucumber/gherkin`. Cucumber is a devDependency and is not in `files`, so it reaches no consumer.

The original finding stands as written below, minus its open question. Nothing still runs cucumber on 22.7 — that remains true, and remains why `cucumber-profiles.test.mjs` self-skips there — but the consequence that mattered (a wrong `engines` shipping to consumers) is disproved.

## The original finding

`engines` declares `node >=22`, and the `engine-floor` CI job pins 22.7 as the lowest version the suite runs on. **Cucumber 13 cannot load its own configuration on 22.7.** `@cucumber/cucumber/api` reaches `loadConfiguration` through `lib/configuration/argv_parser.js`, which is CommonJS and `require()`s `@cucumber/gherkin`, which is ESM. That only works from Node 22.12, where `require(esm)` was unflagged; on 22.7 it throws `ERR_REQUIRE_ESM`. Measured against `node:22.7-slim`, not inferred.

`test/js/__tests__/cucumber-profiles.test.mjs` skips itself below 22.12 with that reason at the site, so it is not a blocker. But the underlying question is open and nothing currently answers it: **nothing runs cucumber on 22.7.** `engine-floor` runs `test:js` only, and every Cucumber tier runs on whatever 22.x the runner defaults to. So the declared floor is unverified for the test harness, and possibly for the product.

Two ways to settle it, and they are different sizes:

- If the product itself is fine on 22.7 and only the harness is not, the floor is honest and the note above is enough.
- If anything in the shipped path also needs `require(esm)`, `engines` is wrong and consumers on 22.0-22.11 get a runtime failure that `postinstall`'s `check-version.js` will not catch, because it only compares against `engines`.

Worth resolving before the next release rather than after: `engines` is published metadata and consumers act on it.

## Fix Strategy

**Wired 2026-08-09.** `test:geo` now runs `test:nodejs:geo` then `test:cli2:geo`, and `release.yml`'s `build-and-test` already invokes `npm run test:geo` on both OpenSearch matrix legs, with `release` holding on `needs: [build-and-test, engine-floor]`. So the diagonal is a genuine pre-publish gate rather than post-hoc detection — which is what this ticket said was the only shape that closes it.

Both defects in the unwired script are fixed first, and a third that would have made the fix silently useless:

- **Index collision.** The three `cli2:geo` sites move from `test` to `test-geo`. But `start:server2:preinstalled` also **hardcoded** `ES_INDEX_NAME=test`, so fixing only the geo scripts would have left the loader writing `test-geo` while the server read `test`. That hardcode is removed and the script now inherits from its caller; both callers already set the variable, so the nogeo path is unchanged in value. There is no case for a separate `:geo` variant — `ADDRESSR_ENABLE_GEO` is read at exactly one site in the tree, inside the **loader**, so a geo server script would differ from its sibling in zero variables.
- **Missing heap.** `pretest:cli2:geo` gains the `--max_old_space_size=8196` its packaged-geo sibling already carries.

Kept in `build-and-test` rather than a new job: that job already has the OpenSearch matrix, the G-NAF cache and the OT fixture prep, and a separate job would either duplicate the matrix or drop a leg.

**Verified**: `npm run test:geo` chained — 38 then 34 scenarios, all passing; `npm run test:nogeo` unaffected at 37 / 38 / 33.

### What this gate actually detects, stated because it is thinner than it looks

`@geo` is a **single scenario** across the whole feature set. That one scenario is the only thing distinguishing the geo run from the nogeo run at the assertion level; everything else the geo leg buys comes from the **loader executing its geo branch**, not from test selection. If that scenario is ever tagged out or deleted, the geo legs silently become duplicates of the nogeo legs and this gate stops detecting anything. Worth knowing before trusting it.

Two decision records move as a result:

- [ADR-009](../../decisions/009-cucumber-bdd-testing.accepted.md) records as a _Bad_ consequence that "CI only runs 3 of 10 combinations". Both halves of that were stale: there are three profiles now, not five, so the space is 6 and CI runs **five of the six**. Corrected in that ADR's 2026-08-09 amendment rather than incremented — the "4" first written here came from adding one to a figure that was already wrong, which is the same not-checking-the-base-number mistake the amendment exists to fix.
- [ADR-029](../../decisions/029-opensearch-blue-green-two-phase-upgrade.accepted.md) carries a confirmation criterion requiring "both `test:nogeo` and `test:geo` scopes" to pass. That criterion was assessed when `test:geo` meant one profile; it now means two. Strictly stronger, so the tick still holds, but the referent widened — noted there so a future reader does not over-read it.

**One measurement that had to come first.** My original hand-run of `test:cli2:geo` for the 3.1.0 release was under `--no-strict` (a bare `npm run test:cli2:geo` leaves `NO_STRICT` unset, and cucumber then does not fail on undefined or pending steps), so 34 green did not prove step coverage. Re-run as `NO_STRICT=' ' npm run test:cli2:geo`: still 34 / 217, so the coverage is real. Wiring it without that check would have risked discovering undefined steps as a red master.

## Fix Released

**Released**: 2026-08-09 in **v3.1.1**, from `7fbde89e` (`fix(test): wire the packaged-plus-geo diagonal into the pre-publish gate`). Confirmed in the published artefact rather than inferred: the commit is an ancestor of the released SHA `6fd6603e`, and `client/elasticsearch.js` in the 3.1.1 tarball carries the `TEST_PROFILE` guard.

Fix, in two halves that ship by different vehicles:

1. **The gate itself** — `test:cli2:geo` is wired into `test:geo`, so the packaged-plus-geo diagonal now runs before publish and `release.yml` holds on it. That is CI configuration; the master push is its release vehicle, not npm. Three defects had to be fixed before the leg could run at all: an index collision with the nogeo chain, a hardcoded `ES_INDEX_NAME` in a script shared by both chains, and a missing heap.
2. **The guard, which does ship** — `resolveIndexName()` throws when `ES_INDEX_NAME` is unset under `TEST_PROFILE` instead of silently resolving to the production index name. This is in the npm package as of 3.1.1.

**Awaiting user verification** — the observable is that a release now fails rather than publishes if the packaged-plus-geo tier breaks. The leg has run green on both OpenSearch matrix legs since wiring, including on the 3.1.1 release, so the gate is exercised; what is NOT yet exercised is the gate actually catching a regression, which is the property it exists for.

**Known residue, carried deliberately.** The guard's discriminator does not reach every process this ticket names. `TEST_PROFILE` is set on the cucumber-invoking script strings, so the single-process tiers and the `dotest:cli2:*` strings are covered. It is NOT set by the `pretest:*` loader chains, nor by `start:server2:preinstalled` under the cli2 tier — so if one of those drops `ES_INDEX_NAME`, the loader or the server points at the production index name and nothing throws. That is the write path and the server path, which is where this ticket originally bit. Raised by the risk scorer during the 3.1.1 release assessment; the remedy is either setting `TEST_PROFILE` on those strings too, or moving the discriminator to something both processes carry.

## Workaround

`test/js/__tests__/package-graph-ships.test.mjs` covers the packaging half — the part of this gap the ESM migration created.

**Superseded by the Fix Strategy above as of 2026-08-09**: the behavioural half is now wired into the pre-publish chain. What remains uncovered is narrower and named there — nothing observes the running server's index, because `waitport` is port-only.

## Impact Assessment

- **Who is affected**: consumers of the published package running with geo enabled, which includes this project's own production deployment.
- **Frequency**: only on a defect specific to the pair.
- **Severity**: Significant. The loader writes the live index; the server serves the live API.

## Dependencies

- **Blocked by**: (none)
- **Composes with**: [P033](../open/033-source-inspection-tests-anti-pattern.md) — the in-no-chain script is the same false-coverage shape as a test named after a feature it does not exercise.

## Related

- [ADR-044](../../decisions/044-native-esm-without-a-build-step.proposed.md) — retired the build step, which is what turned `files` from "everything, automatically" into an explicit list.

## A nightly leg does not discharge this

Recording it because it is the obvious suggestion and it is wrong. A nightly run is **post-commit detection**: it cannot fail before the thing it guards ships, so it cannot be credited as a control by this project's own risk policy. The only shape that closes this is `test:cli2:geo` wired into `release.yml`'s pre-publish chain, ahead of the `release` job that publishes and deploys.

If the CI cost of that turns out to be unacceptable, the honest outcome is to accept the risk explicitly and record it in `docs/risks/` — not to add a nightly leg and treat the ticket as closed.

## Closed — verified

**Verified 2026-08-09 on the 3.1.1 release run itself** (`31285196481`), which is the right place to check it: the gate's whole purpose is to stand between a green build and a publish.

From the `build-and-test` log, in order:

```
> NO_STRICT=' ' npm-run-all --serial test:nodejs:geo test:cli2:geo
38 scenarios (38 passed)                     <- source + geo
> ES_INDEX_NAME=test-geo ... run-p --race start:server2:preinstalled dotest:cli2:geo
34 scenarios (34 passed)                     <- PUBLISHED PACKAGE + geo
```

Four properties confirmed together, and each was a separate defect before this ticket:

1. The packaged-plus-geo leg is in the release chain — it ran on the release.
2. It executes 34 real scenarios against the globally installed package, so it is not a no-op.
3. It runs under strict mode (`NO_STRICT=' '`), so undefined and pending steps fail rather than passing quietly.
4. It uses `test-geo`, not `test` — the index collision that would have had it serving the nogeo leg's data is fixed and holding.

That is the configuration production actually runs, and until this ticket it was exercised by nothing.

**What remains open is recorded on P084 rather than here**: the fail-loud guard's discriminator does not reach the `pretest:*` loader chains or `start:server2:preinstalled` under the cli2 tier. That is a narrower gap than this ticket, and closing this one does not close it.

Verified by the agent from run logs rather than left to the maintainer, per direction 2026-08-09.
