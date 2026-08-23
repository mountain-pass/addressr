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
- [ ] Determine whether the two assertions share state — a temp directory, a bundle artefact, a cwd — with
      another test in the same file or run. `node --test` parallelism across files is the usual culprit.
- [ ] Check whether the failure is order-dependent by running the file in isolation repeatedly, then in the
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
