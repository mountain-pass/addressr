# Problem 130: `engine-floor` gates `release`, so a test flake and a shipping decision share one fate

**Status**: Open
**Reported**: 2026-08-24
**Priority**: 6 (Medium) — Impact: Moderate (3) × Likelihood: Unlikely (2). Impact 3: when this fires, a release that should have shipped does not, and [P085](085-push-and-watch-reports-success-on-a-red-master.md) means the watcher may report the push as successful anyway — so the failure is both real and quiet. Likelihood 2 rather than higher **because the known instance is fixed**: [P123](../verifying/123-engine-floor-flake-skips-the-release-job-and-nothing-says-so.md) removed the race that caused the only observed occurrence. This ticket is about the coupling that let one test file's flake stop a production release, which survives that fix.
**Origin**: internal
**Effort**: S — the change itself is a `needs:` edit and a test-expectation update. The work is the decision, not the diff.
**WSJF**: 6.0 — (6 × 1.0) / 1
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

Split out of [P123](../verifying/123-engine-floor-flake-skips-the-release-job-and-nothing-says-so.md), where it sat as an unticked investigation task while the rest of the ticket closed. It was split rather than carried because it is **not a defect and not P123's to answer** — it is a pipeline-coupling decision that needs the maintainer's judgement, and leaving it inside a closing ticket is how it would have been buried.

`release` declares `needs: [build-and-test, engine-floor]`. `engine-floor` is the one job that pins the declared Node engine floor rather than floating to `22.x`, so it exercises what a self-hosted operator on the oldest supported runtime actually gets. That is a real concern and worth testing.

But it is a _compatibility_ concern, and `release` is a _shipping_ decision. Coupling them means any failure in the engine-floor leg — including one with nothing to do with engine compatibility, which is precisely what P123 turned out to be — stops a production release. P123's own root cause was two test files racing on a shared path. Nothing about it was version-related, and it skipped the release job anyway.

## The decision to make

Not obviously "decouple". Both directions have a real cost, which is why this needs a call rather than a fix:

- **Keep the gate.** Shipping a release that breaks the declared engine floor is a broken promise to self-hosted operators, and catching it after publish means a yanked or patched version. The gate is doing something.
- **Decouple.** A release blocked by an unrelated flake is an outage of the shipping path, and [P085](085-push-and-watch-reports-success-on-a-red-master.md) means it can be a silent one. The maintainer is sole operator, so a silently skipped release may go unnoticed until someone asks where the version went.
- **A third option worth pricing before choosing either:** keep the gate but narrow what runs in it, so the engine-floor leg exercises engine compatibility rather than the entire `test:js` suite. That would have made P123's race unable to reach `release` at all, without giving up the compatibility promise.

## Investigation Tasks

- [ ] Establish what `engine-floor` actually runs today versus what it needs to run to make its compatibility claim. If it runs the whole suite, the third option above is likely the answer and the other two are a false binary.
- [ ] Check how often the engine-floor leg has failed for reasons unrelated to engine compatibility. One observed instance (P123) is not a rate. The Release run history has the data.
- [ ] Decide, and record the decision — this is a pipeline-topology choice with a real trade-off on both sides, so it wants a decision record rather than a commit message.
- [ ] If the gate is narrowed or removed, check what asserts the current shape. Test expectations pin the release job's `needs:` list and a change there will red them; that red is the point, but it must be a deliberate widening rather than a count bump.

## Notes

Related to [P085](085-push-and-watch-reports-success-on-a-red-master.md), which is what makes this quiet rather than merely annoying: a watcher reporting "completed successfully" over a run whose `release` job was skipped is how a missed release goes unnoticed. Fixing either one alone leaves the other's harm intact.
