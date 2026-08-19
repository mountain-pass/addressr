# Problem 085: `push:watch` reports "completed successfully" on a red master

**Status**: Open — the scan is extracted and fixture-tested as of 2026-08-19, which closes the pin-hole class rather than another instance of it. Remaining: the completion precondition and the derived deadlines are still source-pinned, and the whole block still awaits a live red run to confirm in anger.
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

- [ ] **Fifth defect in the fix, found in anger 2026-08-05: the job scan can run before the run has finished, so a green run reports RED.**

  Run `30973114823`. `npm run push:watch` printed "Push pipeline failed" and named `build-and-test (3.5.0)` and `build-and-test (2.19.5)` as jobs that did not succeed. Both were still `in_progress` at scan time and both finished `success`; the run concluded `success` with every job green and `docker-publish` skipped.

  `push-and-watch.sh:69` captures `gh run watch --exit-status` non-fatally on purpose — the in-file comment says the job scan below "is the authoritative check, so do not exit on it alone". That reasoning holds only while `gh run watch` blocks to completion. When it returns early instead — a transient is the plausible cause; this session was on a patchy connection — control falls through to a scan of a run that is still in progress. The scan then does exactly what it was built to do: `\(.conclusion // "pending")` is not `success` or `skipped`, so every unfinished job reads as a failure.

  **The default-deny predicate is correct and must not be weakened** — it is this ticket's entire remediation. What is missing is a precondition: the scan is only meaningful once the run is `completed`, and nothing asserts that. Fix is a poll on `gh run view --json status` until `completed`, with a timeout, ahead of the scan, in both `scripts/push-and-watch.sh` and `scripts/release-watch.sh` (identical shape at `:233` and `:253`).

  Direction of failure is the safe one — it cries wolf rather than calling a red run green, so it cannot reproduce the Babel 8 incident this ticket exists to prevent. It is still not harmless: a watcher that reports failure on green runs trains the operator to disbelieve it, which erodes the gate this ticket restored, and it produces a false stop in any loop keyed off the exit code.

  **The first fix was half of one.** The architect review found the same false red surviving one branch further down: a transient makes `gh run watch` exit non-zero AND drops into the scan, so fixing only the scan left the `WATCH_STATUS` branch still reporting "Push pipeline failed" on a green run. Both halves are now fixed — and the run's own top-level `conclusion`, a verdict the job scan had never read, is now captured and checked. That closes a hole nobody had noticed: a run whose _run-level_ conclusion is `failure` while every job reads `success`/`skipped` passed this script until today.

  **Deadlines are derived, not picked.** `push-and-watch.sh` uses 30m (~10x the ~3-minute build). `release-watch.sh` uses 60m, derived from `deploy/main.tf`: the ASG rolling-update `Timeout = "PT30M"` (:604-606, named in ADR 004) plus the EB command `Timeout = "600"` (:610-612) plus `release.yml`'s 120s stabilise sleep plus prod smoke plus docker-publish. A 30m deadline would sit **inside** the release run's own worst case and manufacture a false red after npm publish and the prod deploy had already gone out. On timeout both scripts print `status UNKNOWN` and exit 1 — inconclusive, not a failure verdict, matching the empty-scan branch's epistemic state.

  **`push-and-watch.sh` now has test coverage for the first time.** It had none — the script that actually mis-fired in anger was the unpinned one, while its sibling carried seven assertions. Three new assertions cover both, and the ordering one is index arithmetic rather than a regex, so it survives a `jq` or `case` reimplementation.

  **A pin that passed on a dead mechanism, caught by mutation testing.** The first version asserted `/wait_for_completion \|\| exit 1/` — which matches the call **commented out**. Commenting out the call left every assertion green with the precondition gone, which is the exact hole the architect predicted for a different reason. Anchored to `/^wait_for_completion \|\| exit 1$/m` and the ordering check switched from `indexOf` to the same anchored search. Mutation-proven both ways: commenting the call now fails, and softening the scan to let `pending` pass fails.

  Captured via `/wr-itil:capture-problem` 2026-08-05 and absorbed here rather than opened as a sibling: the `wr-itil:hang-off-check` arbiter returned `HANG_OFF: P085` on the grounds that this ticket owns the block, the defect is a regression in its own fix, and this ticket "cannot honestly reach Verifying/Closed while the scan it installed mis-fires on `pending`".

- [ ] **The remaining pin holes, and why the fixture test is now load-bearing rather than aspirational.** The risk scorer audited the new assertions and found five more of the same shape — _the pin proves a thing is written, not that it is reached or that it terminates_:

  1. The completion **predicate** is unpinned. `--json status,conclusion` pins the field list and `/^wait_for_completion \|\| exit 1$/m` pins the call site, but nothing pins `[ "$RUN_STATUS" = "completed" ] && return 0`. Mutate it to an unconditional `return 0` and every assertion stays green with the precondition gone — the comment-out hole reached by another route.
  2. ~~The run-conclusion check pins the `if`, not the `exit`~~ — **closed 2026-08-05**, mutation-proven. This was a false-GREEN hole and the same lesson the file already recorded for the empty-scan branch.
  3. The `pending` negative guard pins one spelling of the mutation, not the property: `$1 == "pending" || $1 == "queued" { next }`, `$1 ~ /pending/ { next }` and an inverted predicate all soften the scan and all pass.
  4. ~~`push-and-watch.sh`'s empty-scan branch had no pin at all~~ — **closed 2026-08-05**. R023's "empty scan is UNKNOWN, not success" control was re-armable on that script for free.
  5. The derived deadlines are unpinned. `30 * 60` and `60 * 60` fail nothing if changed, so the ADR-004 / `main.tf:604-612` derivation — the most reasoned part of this fix — lives only in a comment, and comments do not fail.

  The two false-green holes were closed; 1, 3 and 5 are false-RED direction and are left, deliberately, because closing them one assertion at a time is the losing game: **each new `assert.match` closes one instance and is itself a new instance waiting to rot.** Five defects in, that rate is the evidence.

  The scorer also corrected the architect's premise that a shell script has no testable surface. It is false for the piece that carries the actual remediation: the awk program at `push-and-watch.sh:141-145` and `release-watch.sh:307-311` is a self-contained filter over a TSV on stdin. Extract it to `scripts/lib/scan-jobs.awk`, feed it a fixture (`success`, `skipped`, `pending`, `cancelled`, `timed_out`, an advisory `check-deps failure`, empty) and assert the exit code. **Every hole listed above is a hole about an exit code, and a fixture asserts exit codes.** That closes the class rather than an instance.

- [x] **Replace the source-inspection pin with a fixture test. DONE 2026-08-19, and it closed the class.**
      The awk filter — byte-identical in both watchers — is extracted to
      `scripts/lib/scan-jobs.awk`, with its verdict in the EXIT CODE: `0` all green, `1` a job did not
      succeed (named on stdout), `2` nothing scanned, which is UNKNOWN and not success. Both scripts load
      it via a `SCRIPT_DIR` resolved from `BASH_SOURCE`, so it works under `npm run` and when invoked
      directly.

      `test/js/__tests__/scan-jobs-awk.test.mjs` feeds it fixtures and asserts exit codes — 15 cases
          covering the real red run `30787856504` (both matrix legs named), each of `cancelled`, `timed_out`,
          `startup_failure`, `neutral` and `action_required` (all of which reached the SUCCESS path under the
          failure-word allow-list), each of `pending`, `queued` and `in_progress` (which must keep failing —
          the fifth defect's remedy is a precondition in the callers, never a softer predicate), the ADR-015
          `check-deps` exemption, that the exemption does **not** extend to a `check-deps-strict`, and that
          UNKNOWN is a distinct code from FAILED so a caller can tell "the run is bad" from "I could not
          find out".

          **Mutation-proven against four historical defect shapes**, each reverted in turn and each caught:
          letting `pending` pass (hole 3), an empty scan reporting success (the fourth defect), widening the
          `check-deps` exemption to a substring, and reverting to the `conclusion == "failure"` allow-list.
          The wiring is mutation-proven too — re-inlining the filter into `push-and-watch.sh` reds the pin.

          **The source pins are repointed from decision to wiring**, which is the point. They now assert the
          scripts LOAD the shared scan and have not grown a private copy; what the scan DECIDES is proven by
          fixture. That is the split this ticket argued for: "each new `assert.match` closes one instance and
          is itself a new instance waiting to rot."

          Holes 1 and 5 from the audit above (the completion predicate, the derived deadlines) are NOT closed
          by this — they live in the callers, not the filter, and both fail in the false-RED direction.

- [x] **SIXTH DEFECT, introduced by the extraction above and fixed in the same commit.** Recorded rather
      than quietly repaired, because it is the ticket's own shape and the count matters.

      Giving the scan an exit code gave both call sites an exit contract they did not have. Under
          `set -euo pipefail` an assignment is a simple command, so `VAR=$(… | awk …)` takes awk's status and
          **the script terminated at the assignment** — making the failure banner, the job list and
          `show_failure_guidance` (which carries the agent-facing routing line) unreachable. A loud failure
          became a silent exit 1, on the release path, after the publish and the apply.

          `release-watch.sh` documents that precise hazard about 100 lines below where it was introduced:
          _"an assignment IS a simple command, so a non-zero command substitution trips `set -e` immediately —
          the status capture and the diagnostic below would be UNREACHABLE … Fail-closed, but mute."_ The fix
          was written without reading its own file's warning.

          Both call sites now use the documented `&& SCAN_STATUS=0 || SCAN_STATUS=$?` idiom and branch on the
          **status**, not on whether stdout was non-empty.

          **Stated precisely, because an earlier draft of this entry overstated it:** the exit-2 branch is
          written and pinned, but it is NOT reachable from either caller today — the `[ -z "$JOBS_TSV" ]`
          guard above the scan already exits on the empty case, and a non-empty `JOBS_TSV` always yields at
          least one line, so `seen == 0` never occurs. It is defence-in-depth for the day that guard is
          refactored away, and it also fires if `scan-jobs.awk` is missing or unreadable. Saying it "gives
          exit 2 its first consumer" was one level stronger than the code supports. Verified by
          running a script, not by reading one: before the fix the diagnostic line never printed; after it,
          it does. Both properties are pinned and mutation-verified — reverting to the bare assignment, and
          capturing the status but never reading it, each red the suite.

          Direction was fail-closed-but-mute rather than false-green, so R023's H1 never reopened. It is still
          the sixth, and it was found by the risk scorer rather than by the tests just written.

- [ ] ~~Replace the source-inspection pin with a fixture test.~~ Superseded by the entry above. `release-workflow-deploy-only.test.mjs` now asserts seven properties of `release-watch.sh`, but two of them are awk-literal, so a reimplementation in `jq` or a `case` statement would hold the property and still break the pin — it is less brittle than the string pins it replaced, not mechanism-independent. The strictly stronger shape is to extract the conclusion predicate from the script and feed it a TSV of conclusions, asserting the exit code and the named jobs. Raised by the risk scorer while reviewing the pin rewrite, along with two holes since closed: nothing asserted `WATCH_STATUS` was ever _read_ (deleting the block passed every assertion), and the empty-scan property pinned the message rather than the exit.

## Dependencies

- **Blocks**: (none mechanically, but it degrades the signal every other change relies on)
- **Blocked by**: (none)
- **Composes with**: (none)

## Related

- **R023** — the register entry recording the same false-negative class in `scripts/release-watch.sh` (checking only the `release` job's conclusion and swallowing `gh run watch`'s exit code). This ticket is the push-path sibling. R023 is one of the 24 uncurated entries P083 tracks, so it carried no baseline into this.
- **P004** — the original false-negative class this belongs to.
- The **Babel 8 module-emission regression** it masked, fixed in the commit that follows this ticket.

Origin: internal, surfaced 2026-08-03 when the risk scorer flagged the selector mismatch during an unrelated review, and the very next push demonstrated it live by reporting success on a red master.
