# Problem 085: `push:watch` reports "completed successfully" on a red master

**Status**: Open — both scripts fixed and regression-tested against a replayed red run; awaiting a live failure to confirm in anger
**Reported**: 2026-08-03
**Priority**: 12 (High) — Impact: Significant (4) × Likelihood: Almost certain (5) — derived at capture; the false green is deterministic for the most common failure shape, and it is the signal the maintainer acts on
**Origin**: internal
**Effort**: S — derived at capture: three jq selectors and one conclusion check in a single script
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

`scripts/push-and-watch.sh` prints **"Push pipeline completed successfully."** when the `build-and-test` matrix legs have failed. It is not a rare race — it is deterministic for the ordinary case, and it fires through three independent defects that happen to compound.

Observed 2026-08-03: commit `ca18113` broke both matrix legs, `npm run push:watch` reported success, and the breakage was only found because the run was checked directly with `gh run view --json jobs`.

## Symptoms

```
Push pipeline completed successfully.
  Build and test:
  Release job: skipped
```

Note the empty value after `Build and test:` — the script had no conclusion to print and said "successfully" anyway.

## Reproduction

Push a commit that fails `build-and-test`. The script reports success.

## Root Cause Analysis

Three defects in `scripts/push-and-watch.sh`, each sufficient on its own:

1. **Line 69 selects a job that does not exist.** `select(.name == "build")` — `release.yml` defines `check-deps`, `engine-floor`, `build-and-test`, `release` and `docker-publish`. There is no `build`. `BUILD_CONCLUSION` is therefore always empty, and the guard on line 70 that reads it can never fire.

2. **Line 79 does not match matrix job names.** `select(.name == "build-and-test")` — with a matrix, GitHub names the jobs `build-and-test (2.19.5)` and `build-and-test (3.5.0)`. The exact-equality selector matches neither, which is why the report line prints empty.

3. **A failed dependency makes `release` `skipped`, not `failure`.** Line 70 only treats `"failure"` as failure. When `build-and-test` fails, `release` never runs and GitHub records its conclusion as `skipped`, so the one selector that _does_ match a real job reports a value the guard ignores.

Compounding: `gh run watch` on line 65 is invoked as `gh run watch "$RUN_ID" || true`, discarding the non-zero exit that would otherwise have surfaced the failure. `--exit-status` is not passed.

Nothing here is specific to this run. Any `build-and-test` failure produces a green report.

## Impact Assessment

- **Who is affected**: the maintainer, on every push. No consumer or runtime path directly — but see below.
- **Frequency**: every failing push. Deterministic.
- **Severity**: Significant. The direct cost is a red master believed green, so the breakage persists and the next change stacks on top of it. That is what happened on 2026-08-03: the Babel 8 module-emission regression sat on master reported as a success. The consequential shape is worse — the same script's report is what a maintainer uses to decide whether it is safe to proceed to `release:watch`.

## Workaround

Verify the run directly instead of trusting the script:

```bash
RID=$(gh run list --limit 1 --branch master --json databaseId --jq '.[0].databaseId')
gh run watch "$RID" --exit-status
gh run view "$RID" --json jobs --jq '.jobs[] | "\(.conclusion)\t\(.name)"'
```

This lists every job including matrix-suffixed and newly added ones, and `--exit-status` propagates failure.

### Investigation Tasks

- [x] **Went further than prefix matching: the script now allow-lists nothing.** It enumerates every job in the run and treats anything that is not `success` or `skipped` as a failure. Prefix matching would have fixed the matrix legs and left the next new job uncovered, which is the defect repeating rather than closing.
- [x] **Any non-success conclusion now fails**, so `cancelled` and `timed_out` are caught too, not just the literal `"failure"`.
- [x] **`gh run watch` now runs with `--exit-status`** and its code is captured rather than discarded. The job scan is authoritative, but a non-zero watch exit with an all-green scan is also treated as a failure, on the grounds that the watcher saw something the scan did not.
- [x] **Job-agnostic by construction**, so `engine-floor` is covered without the script being edited. `check-deps` is the single deliberate exemption because ADR-015 makes it `continue-on-error: true`.

  **Regression-tested against the real red run.** Replaying run `30787856504` — the one that reported "completed successfully" while both matrix legs failed — through the new filter correctly reports failure and names both offending legs. The advisory `check-deps` failure is correctly ignored, and `skipped` jobs correctly pass.

- [x] **Closed a fourth defect the risk scorer found in the fix itself.** An empty jobs array would still have reported green: `printf` feeds awk one blank line, it matches no rule, and execution falls through to the success path. The script now treats an empty scan as UNKNOWN and exits 1. A scan that learned nothing must not report success — which is the same shape as the three defects above, silence read as a pass.

- [x] **`scripts/release-watch.sh` fixed the same way 2026-08-03.** It carried three defects of its own, and the PR-check one was worse than the push-path original:

  - `select(.name == "build")` on the release PR's checks. `release.yml` has no job by that name, so the selector matched nothing on **every** run, the empty branch was taken unconditionally, and after ~60s the script announced "No build check found (expected for changeset PRs)" and proceeded. The "expected for changeset PRs" rationale is sometimes true, but the broken selector meant that branch fired regardless — so a genuinely red release PR was never caught, and the 60-second wait was theatre. It now reads every check, fails on any that concluded badly, and treats "no checks" as proceed-worthy only when the list is genuinely empty rather than when a selector missed.
  - The job scan selected only `conclusion == "failure"`, so `cancelled`, `timed_out`, `startup_failure`, `neutral` and `action_required` all reached the green path, as did an empty jobs array. Now allow-lists nothing: anything not `success` or `skipped` fails, with `check-deps` the single ADR-015 exemption, and an empty scan is UNKNOWN. That last one matters more here than on the push path, because this check runs **after** npm publish and the prod deploy.
  - `gh run watch "$RUN_ID" || true` discarded the exit code. Now `--exit-status` with the code captured and subordinate to the job scan.

  Regression-tested against the same real red run `30787856504`: correctly fails and names both matrix legs, ignores advisory `check-deps`, passes `skipped`. A synthetic `cancelled` leg is now caught where it previously passed.

- [ ] Replace the source-inspection pin with a fixture test. `release-workflow-deploy-only.test.mjs` now asserts seven properties of `release-watch.sh`, but two of them are awk-literal, so a reimplementation in `jq` or a `case` statement would hold the property and still break the pin — it is less brittle than the string pins it replaced, not mechanism-independent. The strictly stronger shape is to extract the conclusion predicate from the script and feed it a TSV of conclusions, asserting the exit code and the named jobs. Raised by the risk scorer while reviewing the pin rewrite, along with two holes since closed: nothing asserted `WATCH_STATUS` was ever _read_ (deleting the block passed every assertion), and the empty-scan property pinned the message rather than the exit.

## Dependencies

- **Blocks**: (none mechanically, but it degrades the signal every other change relies on)
- **Blocked by**: (none)
- **Composes with**: (none)

## Related

- **R023** — the register entry recording the same false-negative class in `scripts/release-watch.sh` (checking only the `release` job's conclusion and swallowing `gh run watch`'s exit code). This ticket is the push-path sibling. R023 is one of the 24 uncurated entries P083 tracks, so it carried no baseline into this.
- **P004** — the original false-negative class this belongs to.
- The **Babel 8 module-emission regression** it masked, fixed in the commit that follows this ticket.

Origin: internal, surfaced 2026-08-03 when the risk scorer flagged the selector mismatch during an unrelated review, and the very next push demonstrated it live by reporting success on a red master.
