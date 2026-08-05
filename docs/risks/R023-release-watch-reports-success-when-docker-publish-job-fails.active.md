# Risk R023: Pipeline watchers report success on a red run

> **Filename retained deliberately.** The `<slug>` in this file's name is the dedupe key the ADR-056 Phase 2b drain matches on, so renaming it would let the same hazard re-scaffold as a new entry. The H1, the README row and the body carry the corrected scope; the filename is an identifier, not a description.

**Status**: Active — treated 2026-08-04, pending exercise against a live failure
**Category**: operational (ISO 31000) — release-pipeline observability
**Identified**: 2026-07-27
**Owner**: addressr-maintainer
**Last reviewed**: 2026-08-04
**Next review**: 2027-02-04
**Curation**: human-curated 2026-08-04 (superseding the auto-scaffolded pending-review state of 2026-07-27)

## Description

`release.yml` is now multi-job but `scripts/release-watch.sh` checks only the `release` job's conclusion and swallows `gh run watch`'s exit code, so a failed `docker-publish` is reported to the operator as a successful release (P004 false-negative class, new surface).

> **Origin.** Auto-scaffolded by the Phase 2b drain (`wr-risk-scorer` ADR-056) from a
> `wr-risk-scorer:pipeline` RISK_REGISTER_HINT bullet. The scoring fields **carried** the
> ADR-026 ungrounded-output sentinel until the curation recorded in the Change Log below;
> they are grounded now. The original description was the agent's prefill.

## Base rate — this stopped being hypothetical on 2026-08-03

The scaffolded description called this a hypothetical about `docker-publish`. It is not hypothetical, the mechanism is broader than one job, and both watcher scripts carried it.

**It fired.** On 2026-08-03 commit `ca18113` (the Babel 8 bump) left BOTH `build-and-test` matrix legs red, and `npm run push:watch` printed **"Push pipeline completed successfully."** The breakage was found only because the run was checked directly with `gh run view --json jobs`. A regression that made the published package unloadable therefore sat on master reported as green.

Four compounding defects, each sufficient alone, and none specific to `docker-publish`:

1. A selector on a job named `build`. `release.yml` has no such job, so that guard could never fire.
2. A selector on the exact name `build-and-test`, while a matrix names its jobs `build-and-test (2.19.5)` and `(3.5.0)`. Matched neither — which is why the report printed an empty conclusion and said "successfully" anyway.
3. A test for the literal `"failure"`. When `build-and-test` fails, `release` never runs and concludes `skipped`, so the one selector that did match a real job returned a value the guard ignored.
4. `gh run watch` invoked `|| true`, discarding the exit code that would otherwise have surfaced it.

`release-watch.sh` carried the same class plus a worse instance: its PR-check loop selected the non-existent `build` job, so its "no build check found, proceeding" branch fired on **every** run. A red release PR was never caught there, and the 60-second wait before it was theatre.

The through-line is that both scripts **allow-listed job names**. An allow-list goes stale the moment a job is added, and the `engine-floor` job added on 2026-08-03 was already outside every selector in both scripts on the day it landed.

## Inherent Risk

Impact × Likelihood _before_ controls.

- **Impact**: 4 (Significant) — the release-tier instance is the sharp one. `release-watch.sh`'s job scan runs AFTER npm publish and the production Terraform apply, so a false green means an operator believes a release shipped clean when part of it did not: npm and GHCR left divergent, or a deploy step's real outcome misreported. The push-tier instance is Impact 3 on its own (a red master believed green, so the next change stacks on breakage) but it is the same defect class and is scored here at the higher of the two.
- **Likelihood**: 4 (Likely) — deterministic given a failing job, not probabilistic. Observed once for real; available on every run.
- **Inherent Score**: 16
- **Inherent Band**: High

## Controls

- **Default-deny job scan in BOTH scripts — EVIDENCED.** Neither now allow-lists anything: every job in the run is enumerated and anything that is not `success` or `skipped` fails. `check-deps` is the single deliberate exemption, because ADR-015 makes it `continue-on-error`. A job added later is covered without either script being edited, which is the property the allow-list lacked. `scripts/push-and-watch.sh` (commit `c0dbccb`), `scripts/release-watch.sh` (commit `7a48f8f`).
- **Empty scan is UNKNOWN, not success — EVIDENCED.** An empty jobs array previously fell through to the green path. Both scripts now exit non-zero on it. This matters most on the release path, where the scan runs after publish and deploy — silence is the worst possible thing to read as success there.
- **`gh run watch --exit-status`, captured — EVIDENCED.** The code is no longer discarded. The job scan is authoritative, but a non-zero watch exit against an all-green scan also fails, on the grounds that the watcher saw something the scan did not.
- **Regression-tested against the real failure — EVIDENCED.** Both scripts' predicates were replayed against run `30787856504`, the actual run that reported success while both legs failed. Both now fail it and name both offending legs, ignore advisory `check-deps`, and pass `skipped`. A synthetic `cancelled` leg is caught where it previously passed.
- **Pinned in CI — EVIDENCED but MECHANISM-COUPLED.** `test/js/__tests__/release-workflow-deploy-only.test.mjs` carries 8 assertions over 5 properties, three of them negative guards naming the exact removed defect strings, and runs under `test:js` on every push. Two of the assertions are awk-literal, so a reimplementation in `jq` would hold the property and still break the pin — it is less brittle than the string pins it replaced, not mechanism-independent. P085 carries the fixture-test remedy as an open task.

## Residual Risk

Impact × Likelihood _after_ controls.

- **Impact**: 4 (Significant) — unchanged. The controls change whether a false green is produced, not what one costs.
- **Likelihood**: 1 (Rare) — the class that produced all four defects (allow-listing names) is structurally gone; the replay exercises the exact historical failure; the pin runs in CI.
- **Residual Score**: 4
- **Residual Band**: Low
- **Within appetite?**: Yes

**Not yet exercised in anger.** Both fixes are verified against a REPLAYED run, not against a live failure. Neither has reported on a genuinely red run since landing. That is why this entry stays Active with the treatment marked pending exercise, rather than being retired on the strength of the fix.

## Treatment

**Mitigate.** Both scripts fixed, regression-tested against the real red run, and pinned in CI.

The residual sits on two named gaps rather than on the mechanism:

- The CI pin is mechanism-coupled (P085 open task: extract the predicate and fixture-test it).
- Neither script watches anything but `release.yml`, so a red `docker-image.yml` remains outside both. Ironic given `docker-publish` is what the original hint named; the fix covers every job IN the watched workflow, not every workflow.

**The durable control is the habit, not the script.** Verify a run directly rather than reading a summary line: `gh run view <id> --json jobs --jq '.jobs[] | "\(.conclusion)\t\(.name)"'`. That lists matrix-suffixed and newly-added jobs by construction, and it is what caught the failure the scripts missed. Promoted to the briefing's session-start Critical Points on 2026-08-04.

## Monitoring

- **Trigger to re-assess**: a new job added to `release.yml`, or the first live red run after these fixes (which converts "verified by replay" into "verified in anger"). Deliberately NOT "a new pipeline hint with this slug" — scorer activity is not the event that matters, and that trigger shape is why this register sat uncurated (P083).
- **Metrics**: none needed. The next red run is the test.

## Related

- Criteria: `RISK-POLICY.md`
- Realised-as: **P085** (`push:watch` reports success on a red master) — opened 2026-08-03 when this fired, carries both scripts' fixes and the one remaining fixture-test task. **P004** — the original false-negative class.
- Treatment ADRs: **ADR-040** (release-pipeline change-type action matrix) made `release.yml` multi-job, which is what turned a single-job check into a false-negative surface. **ADR-015** — why `check-deps` is the one exemption.
- Personas affected: `docs/jtbd/addressr-maintainer/`

## Evidence Log

Auto-populated from `.risk-reports/` via Phase 2b drain.

- 2026-07-27T01:35:49Z: fired in `.risk-reports/2026-07-27T01-35-49-commit.md` (reason: above-appetite-residual)

## Change Log

- 2026-07-27: Auto-scaffolded by the Phase 2b drain (ADR-056, plugin-scoped). Pending human curation.
- 2026-08-04: Curated. Upgraded from hypothetical to **observed**: the risk fired on 2026-08-03, reporting a red master as a successful push and hiding a regression that made the published package unloadable. Scope widened from `docker-publish` to the allow-listed-job-names class, which affected both watcher scripts and four distinct selectors. Scored 16 inherent / 4 residual, with the residual held above Rare-and-retired because both fixes are verified by replay rather than against a live failure. Curated as part of the P083 register drain.
