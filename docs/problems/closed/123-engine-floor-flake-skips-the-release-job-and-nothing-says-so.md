# Problem 123: An engine-floor flake skips the release job, and the watcher still says the push succeeded

> **CLOSED 2026-08-24.** Two test files were racing on a shared mutable path in the real source tree; the
> copy is now derived from git's index, so the path is not shared and the race cannot occur. Closed on the
> evidence set out in _What discharges this ticket_, not on the green run — see that section for why one
> green would have been the weaker instrument.
>
> The push on commit `63c39ee0` gave the fix its chance to be refuted and did not take it:
> `engine-floor` **success**, `release` **success** (ran rather than skipped), `website-build` success,
> both `build-and-test` legs success, `docker-publish` skipped for want of changesets. `check-deps` failed,
> as it does routinely — it is `continue-on-error: true` and gates nothing.
>
> Read job by job, deliberately. The watcher printed "Push pipeline completed successfully" while listing
> `failure check-deps` in the same output — [P085](../open/085-push-and-watch-reports-success-on-a-red-master.md)
> demonstrating itself on the very run that closed this ticket.
>
> Two things were split out rather than closed with it:
> [P129](../open/129-the-deployment-artefact-ignore-contract-is-enforced-at-three-sites-and-written-down-at-none.md)
> (the artefact/ignore contract has no written record) and
> [P130](../open/130-engine-floor-gates-release-so-a-test-flake-and-a-shipping-decision-share-one-fate.md)
> (whether `engine-floor` should gate `release` at all — a maintainer decision, not a defect).

**Status**: Closed — 2026-08-24, fixed
**Reported**: 2026-08-23
**Priority**: 6 (Medium) — Impact: Moderate (3) × Likelihood: Unlikely (2). Impact 3: `release.yml:205` gives the `release` job `needs: [build-and-test, engine-floor]`, so an engine-floor failure **skips the release job entirely**. A release that should have happened does not, and the failure is in a job whose subject is unrelated to the release. Likelihood 2: measured, not estimated — 1 failure in the last 15 Release runs on master (run 32458245036, sha 569aef18), so roughly 7%.
**Origin**: internal
**Effort**: M — reproducing a non-deterministic failure on the 22.7 floor, then fixing the ordering or isolation defect behind it.
**WSJF**: 3.0 — (6 × 1.0) / 2
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

Observed while verifying the push of `41ac158c`. The prior commit on master, `569aef18`, had a **red** Release
run: `engine-floor` failed and `release` was skipped as a consequence. The very next Release run, on
`41ac158c`, passed the same job.

**Nothing executable changed between the two.** `git diff --name-only 569aef18..41ac158c` returns seven
paths, all under `docs/`. The test and everything it exercises are byte-identical across both runs, so the
difference is non-determinism, not a fix.

**One leaf test failed**, in `test/js/__tests__/deploy-version-resolution.test.mjs`, and its parent suite
reported red as a consequence:

```
not ok 2  - bundles EXACTLY the manifest, which is what makes the source_hash honest
not ok 39 - deploy.sh applies the resolved version at EVERY site (P095)
```

`not ok 39` is the `describe` rollup at `:185`, not a second assertion; the leaf is the `it` at `:308`.
Stated precisely because "two assertions failed" would send an investigator looking for a second defect
that is not there.

Step conclusions for that job: `Unit tests on the declared engine floor` **failure**, and
`Licence audit of the published production tree` **skipped** as a result — so a flake here also silently
drops the ADR-011 compliance gate that P106 exists to keep in CI.

## Why this is worse than an ordinary flake

Three properties compose badly:

1. **It gates the release job.** Not a reporting nuisance — an actual release that does not happen.
2. **The failing subject is the deployment-version resolution path.** These assertions are P095's, about
   `deploy.sh` applying the resolved version at every site. A reader who sees them red will reasonably
   suspect a real deploy defect and go looking for one that is not there; a reader who learns they flake
   may start discounting them when they are right.
3. **The watcher reported success anyway.** `npm run push:watch` on the green run printed
   "Push pipeline completed successfully" while listing `failure check-deps` in the same output. That is
   the P085 class, and it is the reason the briefing says never to trust a pipeline summary line. On this
   occasion the summary was harmless because the run genuinely was green and `check-deps` is
   `continue-on-error: true` — but the same output shape would have appeared over a run whose failure
   mattered.

## Investigation Tasks

- [~] Reproduce on Node 22.7 specifically. Every other job floats to `22.x`, so this leg is the only one
  exercising the declared engine floor and the flake may be version-coupled rather than ordering-coupled.
  **SUPERSEDED, not done.** The root cause is two test files racing on a shared mutable path; nothing in
  it is version-coupled. The hypothesis was reasonable before diagnosis and is dead after it. Left
  visible rather than ticked, because ticking would claim work that was never performed.
- [x] Determine whether the two assertions share state — a temp directory, a bundle artefact, a cwd — with
      another test in the same file or run. `node --test` parallelism across files is the usual culprit.
- [x] Check whether the failure is order-dependent by running the file in isolation repeatedly, then in the
      full suite repeatedly. A count, not an impression.
- [x] Once diagnosed, mutation-test the fix: the assertions must still red when `deploy.sh` genuinely stops
      applying the resolved version at a site. A flake fix that also removes the detection is worse than the
      flake. **Done, and re-done in the second pass across both tree states — see the four-row table below.**
- [→] Separately: consider whether `engine-floor` should gate `release` at all. It exercises the supported
  engine floor for self-hosted operators, which is a real concern, but a flake there stopping a
  production release couples two unrelated risks. **SPLIT OUT — this is not P123's to answer and must
  not hold it.** It is a pipeline-coupling decision needing the maintainer's call, not a defect. Carried
  to [P130](../open/130-engine-floor-gates-release-so-a-test-flake-and-a-shipping-decision-share-one-fate.md)
  so closing P123 cannot bury it.

## Related

- **P085** — `push:watch` reports success on a red master. Same watcher, same output shape; this ticket is
  another instance of why that one matters.
- **P106** — the licence gate that exists only because a compliance control must run in CI. An engine-floor
  flake skips it, which is a quieter version of the same failure that ticket closed.

## Root cause — reproduced locally 2026-08-23; the Node floor is not a precondition

Reproduced on the developer machine, which removes the 22.7 hypothesis as a _precondition_ (this run was on
the session's default Node, not the floor):

| Harness                                                                       | Runs | Failures |
| ----------------------------------------------------------------------------- | ---- | -------- |
| `node --test test/js/__tests__/deploy-version-resolution.test.mjs` (isolated) | 12   | **0**    |
| `node --test test/js/__tests__/*.test.mjs` (full suite, parallel)             | 5    | **1**    |

Isolated it is clean; in the parallel suite it fails. The failure message names the mechanism:

```
cp: cannot stat '/Users/tomhoward/Projects/addressr/apps/addressr-deployment/mountainpass-addressr-deployment-3.3.2.zip': No such file or directory
```

**That is a fixed path inside the real working tree, not a temp directory.** `apps/addressr-deployment/`
currently holds three such artefacts — `mountainpass-addressr-deployment-1.1.0.zip`,
`mountainpass-addressr-deployment-3.3.2.zip`, `test-mountainpass-addressr-deployment-1.1.0.zip` — and
`git ls-files` shows **none of them tracked**. They are build output the tests leave behind in a source
directory.

The path is derived from the resolved version, so it is the _same_ path on every run and for every
concurrent reader, and `node --test` executes files in parallel. Green in isolation is exactly what that
predicts.

**The version number is a fingerprint, and it names the participant.** `packages/addressr/package.json` is
`3.3.2` — the version in the failing path — while `deploy-version-resolution.test.mjs`'s own harness writes
a fake manifest at **3.1.0** (`:214`) into `mkdtempSync` temp dirs (`:197-215`). A 3.3.2 artefact therefore
**cannot** come from that test's fixtures; it can only come from something resolving against the real
manifest. `deploy-sh-plan-only.test.mjs:41-46` sets `DEPLOY_DIR` to `<repo>/apps/addressr-deployment` — the
real working tree — and runs the real `deploy.sh`, stubbing **only `terraform`**, not `zip` and not `rm`.

And `deploy.sh` is destructive on that fixed path by design: `:53` is
`rm -f "mountainpass-addressr-deployment-${deploy_version}.zip"`, `:76` recreates it. So any two overlapping
runs against the same `DEPLOY_DIR` have one deleting what the other just built. That is a read-the-code
certainty about the mechanism, independent of the sample size above; what remains open is which pair of
invocations actually overlapped.

**Whether this is the SAME failure as the CI one is not yet established.** — WRITTEN 2026-08-23, **SETTLED
2026-08-24, and the answer was yes.** Retained because the caution was correct at the time and the way it
was settled matters: it took one log fetch, not an argument. The CI evidence recorded above was
`not ok 2` / `not ok 39` only; nothing then confirmed run 32458245036's log carried the same
`cp: cannot stat` line. See _CI instance confirmed_ below for what the log actually said.

Two further caveats on the evidence, so nobody over-reads it. Under `node --test` parallel execution stderr
from every file interleaves, so **attributing the `cp:` line to the leaf at `:308` is inference, not
observation**. And 0-in-12 versus 1-in-5 is a small sample: it is consistent with a large difference between
isolated and parallel rates, but the statistics alone would not carry the claim. What carries it is the
mechanism below.

## Revised fix direction

Isolate the artefact per test run — a temp directory with a unique path — rather than writing into
`apps/addressr-deployment/`. That removes the race at its source instead of serialising around it. Two
things to preserve while doing it:

- The assertion's meaning. `bundles EXACTLY the manifest, which is what makes the source_hash honest` is a
  real invariant about what the deployment archive contains; the fix must not weaken it into a check that
  the archive merely exists. Mutation-test in both directions, per the task above.
- The artefacts should probably not be produced in a tracked source directory at all, even when the race is
  gone. Untracked build output in `apps/addressr-deployment/` is how the collision became possible.

## Revised task list

- [x] Isolate the archive path per run (temp directory), and confirm 0 failures across at least 20
      full-suite runs — the pre-fix rate was 1 in 5, so a handful of green runs proves nothing.
- [x] Mutation-test that the isolated assertion still reds when the archive contents genuinely diverge from
      the manifest.
- [x] Confirm the CI instance is the same failure by fetching run 32458245036's log and looking for the
      `cp: cannot stat` line. **Done 2026-08-24. Confirmed — see below.**
- [x] Decide whether these tests should run the real `deploy.sh` against the real `apps/addressr-deployment`
      at all. **They are already gitignored** — `.gitignore:109` carries an unanchored `*.zip`, which is why
      `deploy-artefact-ignores.test.mjs` never needed to enumerate them — so this is about test isolation,
      not about ignore rules. Note that unanchored rule is one of the few in that block without a mid-pattern
      separator, which is why it survived both 2026-08-10 directory moves intact.

## Fixed 2026-08-23 — the polluter, not the victim

**Root cause, restated exactly.** `deploy-sh-plan-only.test.mjs` ran the real `deploy.sh` with
`cwd: apps/addressr-deployment` — the real source directory. `deploy.sh` is destructive there by design:
`rm -rf deployment`, then `rm -f mountainpass-addressr-deployment-<version>.zip`, both fixed paths.
Concurrently, `deploy-version-resolution.test.mjs:237` built its workspace with `cp -R` of that same
directory. Under `node --test` files run in parallel, so one was deleting artefacts while the other copied
them, and `cp` failed with `cannot stat …-3.3.2.zip`. The version was the fingerprint: 3.3.2 is the REAL
package version while that test's own fixtures are 3.1.0, so the artefact could only have come from the real
tree.

**The fix isolates the polluter.** `deploy-sh-plan-only` now builds a temp workspace mirroring the layout the
scripts resolve against — `work/apps/addressr-deployment` copied from the real one, plus
`work/packages/addressr/package.json` copied real rather than faked, because this suite is about deploy.sh's
control flow and a fixture version would make the resolution unrealistic. Nothing writes to the source tree
any more. The `.terraform/environment` save-and-restore went with it: there is nothing left to restore.

**The leak assertion had to be rewritten, not just repointed, and this is the part worth reading.** It
asserted `git status --porcelain` over `apps/addressr-deployment` was empty. Once execution moved to a copy
that assertion **passes having observed nothing** — a green meaning "the script never ran here" is
indistinguishable from one meaning "every artefact is covered". So it now asks the question directly: diff
the copy against a pre-run baseline to get the files deploy.sh actually produced, map them to repo-relative
paths, and ask `git check-ignore` whether the repo's rules would cover each. It carries a floor that reds
when the created set is empty. The old real-tree check is retained alongside — described here as
belt-and-braces, which the second pass below corrects: it is the only remaining surface that looks at the
operator's real directory.

**Evidence.**

|                                  | pre-fix                    | post-fix          |
| -------------------------------- | -------------------------- | ----------------- |
| isolated runs of the victim file | 0 / 12 failed              | —                 |
| full-suite parallel runs         | **1 / 5 failed**           | **0 / 20 failed** |
| CI                               | ~7% (1 in 15 Release runs) | pending           |

Twenty runs because five would not have been evidence: at the observed ~20% rate, eight consecutive passes
still happen ~17% of the time by luck, and twenty bring that to ~1.2%. The mechanism argument is the stronger
half regardless — the shared mutable path is gone, so the race is structurally impossible rather than merely
less frequent. (Qualified in the second pass below: impossible _within the suite_, not against an operator
running a real deploy at the same time.)

Mutation-proved in both directions: dropping `*.zip` from `.gitignore` makes the created bundle un-ignored
and reds the new assertion; restoring it greens.

**Also removed**: three stale zips and a `deployment/` directory sitting in `apps/addressr-deployment`,
left there by the old behaviour. All gitignored build output, nothing tracked touched.

## CI instance confirmed 2026-08-24

Run 32458245036's log was fetched. It carries the failure verbatim:

```
cp: cannot stat '/home/runner/work/addressr/addressr/apps/addressr-deployment/deployment': No such file or directory
cp: cannot stat '/home/runner/work/addressr/addressr/apps/addressr-deployment/mountainpass-addressr-deployment-3.3.2.zip': No such file or directory
  not ok 2 - bundles EXACTLY the manifest, which is what makes the source_hash honest
not ok 39 - deploy.sh applies the resolved version at EVERY site (P095)
```

Same `cp` invocation, same two missing paths, same 3.3.2 fingerprint, same victim assertions. The local
reproduction and the CI red are now one fact. Job outcomes on that run were `engine-floor: failure`,
`check-deps: failure`, `release: skipped`, `docker-publish: skipped` — and `check-deps` is
`continue-on-error: true`, so it contributed nothing to the skip. `engine-floor` alone caused it.

## Second pass 2026-08-24 — three defects in the first fix

A risk review of the fix found the isolation incomplete. All three are real and all three are fixed here;
recording them because the shape is instructive — the first fix moved the race out of the way and left the
_assertion_ weaker than it looked.

1. **The isolated copy was unfiltered.** `cpSync` of the whole directory imported whatever a developer's
   last `npm run deploy:prod` had left there — `deployment/`, a version-named zip, `.terraform/` with its
   provider binaries. Those are exactly the paths `deploy.sh` recreates, so they were captured in the
   pre-run baseline and then filtered out of the "files the script created" set. **On any machine that had
   ever deployed, the ignore-coverage assertion examined nothing while reporting green.**
2. **`.terraform/environment` was inherited**, so the `deploy:prod selected the prod workspace` assertion
   could read `prod` from the developer's own workspace selection and pass without `deploy.sh` having
   written anything. Honest on CI's fresh checkout, dishonest locally.
3. **A comment contradicted the code.** It claimed the check was "ABSOLUTE, not a delta against a baseline"
   while the shipped code _was_ a delta — and that fossil specifically argues for deleting the retained
   real-tree check, which turns out to be load-bearing. A maintainer following it would have opened a hole.

**One change fixes all three: the copy takes git-TRACKED FILES ONLY.** 24 files. The baseline is pristine by
construction, because `.gitignore` guarantees `deployment/`, `*.zip` and `.terraform/` are never tracked and
therefore cannot enter it. Bytes come from the worktree rather than `git show HEAD:`, so the suite still
gates uncommitted edits to `deploy.sh` itself; per-file `cpSync` preserves the executable bit that
`deploy.sh:17` needs to exec `./resolve-version.sh`.

**The mutation proof was re-run in both tree states, because the first one only covered the clean case.**
That was the same defect seen from the other side: the three stale zips had been cleaned up an hour before,
so the proof validated a state the tree had only just entered.

| tree state                                                                | `*.zip` rule | result                                                                      |
| ------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------- |
| clean                                                                     | intact       | pass                                                                        |
| clean                                                                     | stripped     | **red** — `produces files no ignore rule covers`                            |
| polluted (`deployment/` + 3.3.2 zip present, as a prior deploy leaves it) | intact       | pass                                                                        |
| polluted                                                                  | stripped     | **red**, via the delta assertion — the case the previous form went green on |

The fourth row is the one that matters: it reds through the isolated-copy check rather than the real-tree
stray check, which is what proves the isolated assertion itself has teeth rather than being carried by its
neighbour.

**Two claims from the first pass corrected:**

- The retained real-tree check is **not** "belt and braces". Once the copy is tracked-only it is the only
  surface in the file that observes the operator's actual directory; everything else runs against a
  reconstruction. The comment now says so, and says not to delete it.
- "Structurally impossible" was too strong. The suite-internal race is gone, but the victim still `cp -R`s
  the live directory, so an operator running `npm run deploy:prod` concurrently with the suite still
  reproduces the original collision. Out of scope for CI; worth not overclaiming.

**Also captured**: [P129](../open/129-the-deployment-artefact-ignore-contract-is-enforced-at-three-sites-and-written-down-at-none.md),
for the undocumented contract this assertion enforces, and
[P130](../open/130-engine-floor-gates-release-so-a-test-flake-and-a-shipping-decision-share-one-fate.md)
for the pipeline-coupling question this ticket should not have been carrying.

## What discharges this ticket — corrected

An earlier draft of this section said P123 was held for one reason: awaiting a green Release run on the
fixed tree. **That criterion was under-powered, and by this ticket's own arithmetic.** At the recorded
pre-fix CI rate of ~7%, a single green Release run occurs about **93% of the time with no fix at all**. That
is a weaker instrument than the twenty local runs this same ticket already rejected as insufficient, using
exactly this reasoning. Closing on one green would substitute a near-certain-anyway observation for the
evidence that actually carries the claim.

**A green run is not confirmation. A red run would be refutation.** That asymmetry is the whole of its
value, and it is worth having — but it is a falsification check, not the proof.

The evidence that does carry the claim is already complete and required no push:

1. **Mechanism.** The shared mutable path is gone. `deploy.sh` resolves both destructive operations inside
   the temp copy, and the only remaining reference to the real tree is a read.
2. **The CI join.** Run 32458245036's log carries the identical `cp: cannot stat` signature and the same two
   victim assertions. This was fetched rather than argued from, which is what collapsed two facts into one.
3. **The two-state mutation proof.** The assertion reds when the rule is stripped in the polluted tree as
   well as the clean one, and reds through the isolated-copy check rather than its neighbour.

So the ticket closes on that evidence once the push has had its chance to refute it — not because the run
was green.
