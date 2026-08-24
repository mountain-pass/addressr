# Problem 136: `release-pr-plan` calls itself advisory, but a failure blocks the release merge

**Status**: Open
**Reported**: 2026-08-24
**Priority**: 6 (Medium) — Impact: Moderate (3) × Likelihood: Unlikely (2). Impact 3: a job that documents itself as non-blocking can stop a production release, which is the RISK-POLICY "new versions cannot be released or deployed" clause. Likelihood 2: it needs an infrastructure-side failure — a Terraform Cloud workspace lock, a devcontainer build error, a transient secret fetch — rather than anything in the diff.
**Origin**: internal
**Effort**: S — the fix is one `if:` or one honest sentence. Deciding which is the work.
**WSJF**: 6.0 — (6 × 1.0) / 1
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

`.github/workflows/release-pr-plan.yml` opens by declaring itself **"ADVISORY, NOT BLOCKING — deliberately"**. That is true of what the plan _contains_ — a plan showing destructive changes does not fail the job — and false of what the job _concludes_.

`scripts/release-watch.sh`'s release-PR check loop applies a default-deny over the release PR's checks:

```sh
$2 == "check-deps" { next }
$1 == "FAILURE" || $1 == "ERROR" || $1 == "CANCELLED" || ... { print }
```

then `exit 1` — "Release PR checks did not pass. Fix CI first." — **before** the `gh pr merge` that follows it. `check-deps` is the only exemption. `release-pr-plan`'s own `if:` is true on the release PR, so it reports as a check there, and a _job_ failure blocks the merge, the npm publish and the Terraform apply.

So "advisory" is a claim about plan content that a reader will reasonably take as a claim about the job. Those are different things, and only one of them is true.

## Why it surfaced now

Found by a risk review of the Maps-key credential probe, which had the identical defect: a `website-build` step that could block the release PR while three separate comments asserted it could not. That one was fixed by skipping the step on the release PR and pinning the exemption in `release-workflow-deploy-only.test.mjs`. This ticket is the same shape in a different file — and unlike the probe, it was already there.

The general lesson is worth keeping: **`needs` is not the gate.** There are three, and reasoning that names only the first two has now been wrong twice in one day:

1. the `release` job's `needs` list,
2. `scan-jobs.awk`, consumed by `push-and-watch.sh` — reddens master and stalls the watcher,
3. `release-watch.sh`'s own default-deny over release-PR checks — blocks the merge.

## The decision to make

Not obviously "add an exemption". Both directions are defensible:

- **Make it genuinely advisory** — `continue-on-error: true`, or add it to the watcher's exemption list beside `check-deps`. Matches the stated intent. But `check-deps` is exempt because ADR-015 made it advisory _by construction_, and P133 records what that has cost: 45 consecutive unread red runs. A second exempt job is a second unread signal.
- **Keep it blocking and fix the sentence.** A Terraform plan that cannot run before a production apply is arguably something a release _should_ wait for. If so, the header is simply wrong and the fix is one line of prose.

The second looks right, but it turns on whether a plan-job failure is evidence about the apply that follows — which is a question about what the plan is for, not about CI.

## Investigation Tasks

- [ ] Decide which of the two above. Record it; this is the third pipeline-topology question open at once ([P130](130-engine-floor-gates-release-so-a-test-flake-and-a-shipping-decision-share-one-fate.md), [P133](133-check-deps-has-failed-on-every-release-run-for-a-week-so-its-vulnerability-report-has-no-reader.md), this) and they should probably be answered together.
- [ ] Check the wait ceiling while here. `release-watch.sh`'s release-PR check-wait loop allows 30 × 10s = 300s for **all** release-PR checks. A devcontainer build plus a Terraform plan, alongside two OpenSearch matrix legs, is tight against that, and an overrun exits 1 on the terminal-state branch — the same block by a different route.
- [ ] **R023's reassessment trigger has fired and nobody has looked.** `docs/risks/R023-*.active.md:99` declares "a new job added to `release.yml`" as a monitoring trigger. `website-build` is a new job, added with the ADR-053 import. The entry is Last-reviewed 2026-08-04 and does not mention it. Review it — the watched job set has changed and the entry's own Treatment gap ("neither script watches anything but release.yml") is now adjacent to a job carrying a third-party probe.
- [ ] Sweep for other jobs whose `if:` makes them release-PR checks while their documentation assumes they are not. This has been found twice by accident.

## Related

- [P130](130-engine-floor-gates-release-so-a-test-flake-and-a-shipping-decision-share-one-fate.md) — `engine-floor` gating `release` through `needs`. Same family, first gate.
- [P133](133-check-deps-has-failed-on-every-release-run-for-a-week-so-its-vulnerability-report-has-no-reader.md) — what exempting a job from the watcher costs: an unread signal. Directly relevant to option 1 above.
- [P085](085-push-and-watch-reports-success-on-a-red-master.md) — the watcher's selector defects; same scripts, different failure direction.
