# Problem 094: The configuration production actually runs — published package with geo enabled — is tested by nothing

**Status**: Open
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

**And `test:cli2:geo` looks like coverage.** It exists, it is correctly named, and it is complete. A reader scanning `package.json` would reasonably conclude the pair is tested. It is reachable from no chain, which is [P033](033-source-inspection-tests-anti-pattern.md)'s reviewer-trap shape wearing an npm script instead of a test name.

### The residue is narrower than the table suggests

Worth stating precisely, because it is why this is Priority 8 and not higher, and why the interim mitigation below is adequate rather than a fudge.

`service/address-service.js` carries both the geo and no-geo branches in one module, and that module's entire static import graph is already resolved from the tarball by `test:cli2:nogeo`. Geo **data** comes from the G-NAF dataset, not from files inside the package. So the way this gap can actually bite reduces to: _a module reachable only on the geo branch is absent from the tarball_.

That is a static property, and it is now pinned — `test/js/__tests__/package-graph-ships.test.mjs` resolves the import graph from every published entry point with esbuild and asserts every local module it reaches is covered by a `files` entry. Mutation-proved by dropping `utils/`, `client/` and `version.js` from `files` in turn; each fails.

**That is a mitigation, not the fix.** It cannot see a runtime asset read, a dynamic import built from a variable, or a geo-only behavioural regression that has nothing to do with packaging.

### Investigation Tasks

- [ ] Fix the two defects in the unwired script before trusting it. `pretest:cli2:geo` and `test:cli2:geo` use `ES_INDEX_NAME=test`, while every other geo leg uses `test-geo` — wiring it in after `test:cli2:nogeo` would load geo data over the nogeo leg's index. And `pretest:cli2:geo` carries no `NODE_OPTIONS`, unlike its packaged-geo sibling `start:loader:packaged:geo`. Immaterial at OT-fixture scale, but it is drift, and it is evidence that an in-no-chain script rots rather than sitting inert.
- [ ] Decide where it runs, and cost it honestly: geo indexing is slow and wants ~8GiB.
- [ ] Wire it, and confirm the index-name fix by checking the nogeo leg still passes when the two run in sequence.

## Workaround

`test/js/__tests__/package-graph-ships.test.mjs` covers the packaging half — the part of this gap the ESM migration created. The behavioural half is uncovered.

## Impact Assessment

- **Who is affected**: consumers of the published package running with geo enabled, which includes this project's own production deployment.
- **Frequency**: only on a defect specific to the pair.
- **Severity**: Significant. The loader writes the live index; the server serves the live API.

## Dependencies

- **Blocked by**: (none)
- **Composes with**: [P033](033-source-inspection-tests-anti-pattern.md) — the in-no-chain script is the same false-coverage shape as a test named after a feature it does not exercise.

## Related

- [ADR-044](../../decisions/044-native-esm-without-a-build-step.proposed.md) — retired the build step, which is what turned `files` from "everything, automatically" into an explicit list.

## A nightly leg does not discharge this

Recording it because it is the obvious suggestion and it is wrong. A nightly run is **post-commit detection**: it cannot fail before the thing it guards ships, so it cannot be credited as a control by this project's own risk policy. The only shape that closes this is `test:cli2:geo` wired into `release.yml`'s pre-publish chain, ahead of the `release` job that publishes and deploys.

If the CI cost of that turns out to be unacceptable, the honest outcome is to accept the risk explicitly and record it in `docs/risks/` — not to add a nightly leg and treat the ticket as closed.
