# Problem 123: An engine-floor flake skips the release job, and the watcher still says the push succeeded

**Status**: Open
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

- [ ] Reproduce on Node 22.7 specifically. Every other job floats to `22.x`, so this leg is the only one
      exercising the declared engine floor and the flake may be version-coupled rather than ordering-coupled.
- [x] Determine whether the two assertions share state — a temp directory, a bundle artefact, a cwd — with
      another test in the same file or run. `node --test` parallelism across files is the usual culprit.
- [x] Check whether the failure is order-dependent by running the file in isolation repeatedly, then in the
      full suite repeatedly. A count, not an impression.
- [ ] Once diagnosed, mutation-test the fix: the assertions must still red when `deploy.sh` genuinely stops
      applying the resolved version at a site. A flake fix that also removes the detection is worse than the
      flake.
- [ ] Separately: consider whether `engine-floor` should gate `release` at all. It exercises the supported
      engine floor for self-hosted operators, which is a real concern, but a flake there stopping a
      production release couples two unrelated risks.

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

**Whether this is the SAME failure as the CI one is not yet established.** The CI evidence recorded above is
`not ok 2` / `not ok 39` only; nothing confirms run 32458245036's log carried the same `cp: cannot stat`
line. It is the obvious hypothesis and the rates are compatible — roughly 7% on the runner against 1 in 5
locally is the kind of gap scheduling explains — but one log fetch from that run would settle it and has
not been done. Do not treat the CI instance as diagnosed until it is.

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

- [ ] Isolate the archive path per run (temp directory), and confirm 0 failures across at least 20
      full-suite runs — the pre-fix rate was 1 in 5, so a handful of green runs proves nothing.
- [ ] Mutation-test that the isolated assertion still reds when the archive contents genuinely diverge from
      the manifest.
- [ ] Confirm the CI instance is the same failure by fetching run 32458245036's log and looking for the
      `cp: cannot stat` line. Until then the local diagnosis and the CI red are two facts, not one.
- [ ] Decide whether these tests should run the real `deploy.sh` against the real `apps/addressr-deployment`
      at all. **They are already gitignored** — `.gitignore:109` carries an unanchored `*.zip`, which is why
      `deploy-artefact-ignores.test.mjs` never needed to enumerate them — so this is about test isolation,
      not about ignore rules. Note that unanchored rule is one of the few in that block without a mid-pattern
      separator, which is why it survived both 2026-08-10 directory moves intact.
