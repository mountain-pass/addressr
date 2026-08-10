# Risk R020: The manual `deploy_only` recovery path is exercised only against a no-op plan

> **Filename retained deliberately.** The `<slug>` is the dedupe key the ADR-056 Phase 2b drain matches on, so renaming would let the same hazard re-scaffold as a new entry. The H1, the README row and the body carry the corrected scope.

**Status**: Active — RE-SCOPED 2026-08-04 (absorbs R025); treatment PARTIALLY discharged 2026-08-05 — the path was exercised, against a plan that changed nothing
**Category**: operational (ISO 31000) — production infrastructure change control
**Identified**: 2026-07-27
**Owner**: addressr-maintainer
**Last reviewed**: 2026-08-10
**Next review**: 2026-11-10
**Curation**: human-curated 2026-08-04 (superseding the auto-scaffolded pending-review state)

## Description

ADR-001 Amendment 2026-07-27 **authorised** (withdrawn 2026-08-10) a `deploy/**` push-tier production Terraform apply while JTBD-400's "exercise the manual --deploy-only path first" precondition is unmet (zero dispatches); deferral lifted by user 2026-07-26 rather than satisfied.

> **Origin.** Auto-scaffolded by the Phase 2b drain (`wr-risk-scorer` ADR-056) from a
> `wr-risk-scorer:pipeline` RISK_REGISTER_HINT bullet. The scoring fields **carried** the
> ADR-026 ungrounded-output sentinel until the curation recorded in the Change Log below;
> they are grounded now. The original description was the agent's prefill.

## What changed, measured rather than assumed

The entry's premise was a conjunction: the `deploy/**` push-tier axis is **armed** while JTBD-400's "exercise the manual `--deploy-only` path first" precondition is **unmet**, with the deferral lifted by user direction on 2026-07-26 rather than satisfied. R025 says the same thing in fewer words and names R020 in its own description, so the two are merged here.

Both halves were checked against the GitHub Actions history rather than reasoned about, and they have diverged:

**The axis half is discharged, and is no longer unblemished.** _(Historical as of 2026-08-10 — the axis is retired; retained because it is the evidence the Impact raise turns on.)_ The push-tier trigger fired on production six times, **five successful** per [R021](R021-push-tier-deploy-axis-arms-prod-terraform-apply.retired.md)'s canonical cell — the count and the breakdown are R021's to declare and this entry defers to it — the ADR-041 cutover (`33e6c04`), the two staged `addressr5` decommission applies (`96e965c`, `2e557b9`), and `50f1360` clearing R022's held drift against an empty plan, which exercised the trigger rather than an apply. Confirmed by reading each run's `release` job: the `Deploy new version` step concluded `success` on all four. **The fifth, run `31252424980` on 2026-08-08, failed** — it deployed an unpublished version and EB failed on both instances, with `RollbackLaunchOnFailure` holding (P095; R021 re-rated 2026-08-09). The mechanism works and is no longer an untested path; that claim survives the failure, and this entry's Impact — **4 until 2026-08-10, now 5** — depended on it rather than on the path being flawless.

**The recovery half was not, until 2026-08-05.** Every `workflow_dispatch` run of `release.yml` was inspected on 2026-08-04. Four existed (2026-07-24 through 2026-07-28) and on every one the `Deploy new version`, `Wait for deployment to stabilize` and `Smoke test production` steps concluded **`skipped`** — no dispatch had ever carried `deploy_only=true`, nineteen months after the input was added and eight days after the deferral was lifted.

**Exercised 2026-08-05**, twice (runs `30989443618`, `30991052224`). Both carried `deploy_only=true`, both ran the three steps rather than skipping them, and the second completed green. See the Treatment and Residual sections: this retired the plumbing sub-hazard and not the entry.

That inversion was the finding. The path that was _supposed_ to be proven first went unproven for nineteen months while the path armed on the strength of that deferral became the well-exercised one. The inversion is now partly corrected — but the recovery path has still only ever run against a plan that changed nothing, so it remains the less-proven of the two.

## Base rate — the same 0-for-N shape R010 recorded

This project has now twice armed a production capability on the strength of "we will exercise the fallback later", and twice not exercised it:

- The warm-standby rollback net, surrendered twice without ever being flipped (R010's 0-for-2, corrected 2026-08-02 when the drill finally ran).
- The manual `deploy_only` path — 0-for-4 dispatches from the deferral being lifted until 2026-08-05, then 2-for-2 on the same day, both against an empty plan.

R010's was closed by a deliberate drill that took one session. This one was cheaper still — a single dispatch with the box ticked, done 2026-08-05. Both cases share the shape worth keeping: the exercise was trivial and the deferral lasted months.

## Canonical state

Facts this entry asserts, with the phrasings that would contradict them. The
invariants test enforces these; declaring one is what turns a sweep from
remembered into mechanical. This entry needs it more than most — its two facts
were restated across three sections each, and correcting one section left the
others twice.

| Fact                            | Value                                            | Contradicting phrasings                                                                                                                                                                                                               |
| ------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deploy_only` recovery path     | exercised 2026-08-05, empty plan only            | has never been exercised; remains at zero exercises; never been dispatched; is the one still unproven; recovery half is not                                                                                                           |
| push-tier axis applies          | six, five successful, one of those an empty plan | fired on production three times; fired on production four times; EVIDENCED, three production applies; EVIDENCED, four production applies; three successful applies are evidence; four successful applies are evidence; all successful |
| changeset-armed successor route | BUILT 2026-08-10; zero real applies              | the successor is proven; inherits the 2026-08-05 exercises; has carried a real infrastructure mutation; discharged by the predecessor's deletion; route not yet built                                                                 |

## Inherent Risk

Impact × Likelihood _before_ controls.

- **Impact**: 5 (Severe) — **RAISED 2026-08-10 from 4.** This was a _recovery-path_ risk and is no longer one. The realisation is: the push-tier axis is unavailable or unsafe (a red master, a revert in flight, an infra-only fix needed with no code change to push), the operator reaches for `deploy_only`, and it does not work. That is a delayed recovery during an incident, not an outage in itself. It sat below the Severe band on one explicit ground — _"the primary path is now proven and would usually be available"_ — and the 2026-08-10 retirement of the `deploy/**` push axis ([R021](R021-push-tier-deploy-axis-arms-prod-terraform-apply.retired.md)) deletes that ground. `deploy_only` is not a fallback any more; until the successor entry point lands it is the ONLY route to an infrastructure apply, so "the operator reaches for it and it does not work" now means there is nothing else to reach for.
- **Likelihood**: 3 (Possible) — an unexercised path is not a working path. Before 2026-08-05 nothing had ever run those three steps under a dispatch, so a defect in the gating expression, the input plumbing, or the risk-gate's `release:watch` command-prefix interception would surface for the first time under incident pressure.
- **Inherent Score**: 15
- **Inherent Band**: High

## Controls

- **WITHDRAWN 2026-08-10 — the push-tier axis no longer exists, so it can no longer be credited as a control here.** It was credited for exactly one thing: holding Impact at 4 by making `deploy_only` a fallback rather than the only route. Retiring the axis withdraws the credit and the Impact raise above is the consequence. The evidence itself stands as history and is retained: six production applies: three that applied a reviewed plan, one (`50f1360`) that ran against an empty plan and applied nothing, and one (`31252424980`) that applied and failed.** This was the control that set the score, so the qualifiers are load-bearing rather than pedantic.

  **Its argument is superseded and is quoted here rather than left standing**, per [DECISION-MANAGEMENT.md](../../DECISION-MANAGEMENT.md)'s retain-as-history rule — it read: _"The 2026-08-08 failure does not withdraw this control, and the reason is what the control is credited for: it holds impact at 4 rather than 5 because a working primary path means the recovery path is a fallback rather than the only route. A primary path that failed once, auto-rolled back, and had its cause fixed is still available; **it would take the path being unavailable or untrustworthy to push impact to 5**."_

  That last clause is exactly what happened. The path is not merely untrustworthy — as of 2026-08-10 it **does not exist**, so the condition its own author named as the trigger for Impact 5 is satisfied in the strongest available way. The raise above is this bullet's own stated consequence, not a re-reading of it.

- **`release-workflow-deploy-only.test.mjs` pins the gating expression — EVIDENCED.** _(RE-POINTED 2026-08-10 with the successor. It asserted the boolean was compared unquoted — `inputs.deploy_only == true`, never `== 'true'` — the coercion trap that would make the gate silently never fire and take the run **green with the deploy skipped**. That input is deleted, so that assertion is now a must-not-come-back negative. What pins the expression today is the exact `DEPLOY_GATE` string, the three-step occurrence count, the detection step's position ABOVE the changesets step, and its explicit `github.sha` head ref.)_ It pinned the `deploy-paths` step id, its push-event scoping and its fail-closed missing-parent guard until 2026-08-10, when those three assertions were removed with the axis; what survives is the three-gate occurrence count, joined by a new assertion that the axis cannot silently return. Superseded text follows: "It also pins the three-gate occurrence count, the `deploy-paths` step id, its push-event scoping and its fail-closed missing-parent guard. Runs in CI on every push.
- **NOT a control: the four pre-2026-08-05 dispatches.** They exercised the workflow, not the path. Every one skipped all three deploy steps, so they demonstrate that `deploy_only` was absent rather than that it works. Counting them would be exactly the error this entry exists to name. The two 2026-08-05 dispatches DID run the path and are credited in the Residual section — for the plumbing only, since both ran against an empty plan.

## Residual Risk

Impact × Likelihood _after_ controls.

- **Impact**: 5 (Severe) — tracks the inherent raise. No control shortens a recovery that fails when reached for, and no control restores the alternative route whose existence held this at 4.
- **Likelihood**: 2 (Unlikely) — **held at 2, not dropped to 1, and the reason is in this entry's own text.** The path was exercised on 2026-08-05 and the plumbing works: Two `deploy_only=true` dispatches: run `30989443618` and run `30991052224`. In both, the publish steps skipped and `Deploy new version`, `Wait for deployment to stabilize` and the smoke ran rather than skipped — the gate resolves true and everything downstream of it executes. The second run completed green end to end. "Everything downstream of the gate", which the previous likelihood called unproven, is now measured **for dispatch, gating and step-entry**.

  Two things stop it reaching 1. First, **both exercises ran against a plan that changed nothing**, so step-_completion_ under a real plan is still unproven — that is where R003's `version_label` binding fires, the EB fleet cycles at `BatchSize = 100 Percentage`, and stabilise and smoke have something to actually wait on. A different execution profile, not a longer version of the same one. Second, **the smoke flake is partly this entry's hazard, not only R015's**: an operator reaching for `deploy_only` mid-incident gets a successful deploy and a red run on a healthy service, and under incident pressure cannot distinguish "recovery failed" from "runner egress flaked". That produces exactly the delayed recovery this entry's Impact is defined as (4 when this was written, 5 since 2026-08-10) — arriving by a route an earlier draft of this section disclaimed.

- **Residual Score**: 10
- **Residual Band**: High per `RISK-POLICY.md`'s table — above appetite (5, inclusive)
- **Within appetite?**: **No** — appetite is 5 inclusive.

### RE-SCORED 2026-08-10 against the successor route — Impact 5, Likelihood 2, residual 10 (UNCHANGED)

Fired by this entry's own Monitoring trigger ("any change to the deploy-gating expression in `release.yml`") and by the treatment's instruction to re-score at the deletion commit rather than close. `deploy_only` is gone; the changesets-armed release-PR merge is built and is now the sole route.

**The score does not move, and the sameness is a coincidence of two offsetting changes rather than "nothing happened".**

- **Impact stays 5.** The 2026-08-10 raise rested on `deploy_only` being the ONLY route with nothing else to reach for. That ground is spent — but it is replaced rather than removed: the successor is now the only route. **One thing got worse and is priced here**: an ADR-029-class rollback is a Terraform apply, so it must now travel the changesets route — authoring a changeset, a release PR passing its own CI, then a merge whose `release` job carries `needs: [build-and-test, engine-floor]`. Two serialised CI runs ahead of the apply. ADR-029's "rollback within 10 minutes — DISCHARGED 2026-08-02 at 6m36s" was measured against a single `deploy_only` dispatch and **does not transfer**. Recovery is slower than when this entry was last scored.
- **Likelihood stays 2, for a different reason than before.** It was held at 2 because `deploy_only`'s plumbing had been exercised twice. The successor inherits none of that — it has never run at all. Offsetting it: the predecessor's plumbing was proven only by two runs against an empty plan, while the successor's predicate is proven by 17 behavioural cases driving the real script against real git repositories, including the four fail-closed legs and the changeset-release-branch trap. That is a different kind of evidence, not a weaker one, and it caught a live defect before it shipped (the detector read a `HEAD` that `changesets/action` moves; it would have armed an unreviewed production apply on the second changeset-bearing push of any release cycle).

**What is NOT discharged and must not be read as discharged.** The route has carried **zero real applies**. Every exercise is a test fixture; nothing has applied Terraform through it. This entry stays Active and above appetite for exactly that reason. Its treatment is unchanged: run the first real infrastructure change through the changeset-armed route, behind a plan read before the merge.

**A new residual this commit creates, recorded rather than left implicit.** Reverting a released infrastructure change restores changesets as ADDITIONS and lowers the version, so the changesets-consumed conjunct denies and no corrective apply can be armed without authoring a fresh changeset and merging a new release PR. That is deliberate — a tree that says "this changeset is unconsumed" while also saying "apply the infrastructure" is incoherent, and making rollback cheaper than roll-forward would reopen the hand-edit door — but it means rollback is symmetric with, not faster than, forward deployment. Whether that is acceptable for an incident is a decision this entry does not own.

### What the exercise did NOT prove, and one thing it found

The apply was a **no-op by design**: a baseline `terraform-plan.yml` dispatch beforehand reported _"No changes. Your infrastructure matches the configuration"_, and the deploy step's own plan agreed. So the run proves the **plumbing** — dispatch, input honoured, publish skipped, deploy/stabilise/smoke reached — and does **not** prove the path can carry an actual infrastructure mutation. That is the honest remaining gap, and it is smaller than the one it replaces.

**The first run FAILED, and not because of the recovery path.** Run `30989443618` failed at `Smoke test production`: `/api-docs` took **9m18s** to answer and `/debug/shadow-config` then returned HTTP ≥400 (curl exit 22) after ~5 minutes of retries. Terraform had changed nothing, so production was untouched by the run. Probed directly at the same time, production was healthy — `/health`, `/api-docs` and `/debug/shadow-config` all 200 in under 300 ms. The runner saw a degraded edge; the service was fine. The identical dispatch fifteen minutes later passed.

That is a **flaky production smoke gate, observed once in two runs**, and it matters beyond this entry: per [R015](R015-npm-publish-coupled-to-prod-deploy-p039-unresolved.active.md) the smoke runs _after_ npm publish and the production deploy, so a flake reports a release as failed when it has in fact shipped — inviting an unnecessary rollback. Its release-reporting face belongs to [R015](R015-npm-publish-coupled-to-prod-deploy-p039-unresolved.active.md), whose `Smoke test production` control credit now carries the measured false-red rate, with the fix tracked on P039. Its **incident-ambiguity** face is this entry's, and is priced in the Likelihood above.

## Treatment

**Mitigate — treatment PARTIALLY discharged 2026-08-05.** The named treatment was one action: dispatch `release.yml` with `deploy_only=true` and confirm the three steps run rather than skip. Done, twice, via the documented `npm run release:watch -- --deploy-only` route.

It was as cheap as predicted: a no-op apply against already-deployed code on a green master, at a time of choosing rather than during an incident. Sequenced deliberately — a `terraform-plan.yml` baseline first, so the change set was known to be empty before anything ran that could apply. That plan step is the approval gate [R021](R021-push-tier-deploy-axis-arms-prod-terraform-apply.retired.md) records the axis as lacking, performed by hand.

Remaining, and smaller than what it replaced: the path has never carried a real infrastructure mutation, and the smoke gate flaked once in two runs.

**SUPERSEDED 2026-08-10 — this paragraph argued to keep the axis that has now been removed.** It read: _"Deliberately NOT proposed: removing the push-tier axis or re-imposing the deferral. The axis is now the proven path, and the evidence for keeping it is the four applies that succeeded — three that applied a reviewed plan plus one (`50f1360`) that ran against an empty plan and applied nothing. The fifth apply failed (`31252424980`, 2026-08-08) and does not change this: its cause is fixed, and the argument for keeping the axis was never that it cannot fail, but that the alternative leaves the recovery path as the only route."_

The reversal is recorded on [ADR 001](../decisions/001-risk-gated-release-process.proposed.md) and [ADR 040](../decisions/040-release-pipeline-change-type-action-matrix.proposed.md), and it does **not** rest on this paragraph having been wrong on its own terms. It was right that the axis was the exercised path and right that removing it leaves the recovery path unproven and sole — that is precisely why this entry re-scores to 10 rather than retiring. What it could not weigh is the structural defect that retired the axis: the detection predicate diffed a PATH, so a rename OUT of `deploy/` would itself have armed a production apply on a pure refactor.

**SUPERSEDED 2026-08-10 (second revision, same date) — the treatment named a route that is being deleted.** It read: _"**What IS proposed now, and it is this entry's existing treatment rather than new work:** run the first real infrastructure change through `deploy_only` as the named non-empty-plan exercise, sequenced behind a `terraform-plan.yml` baseline dispatch — which, with R021 retired, is the only plan review left on any path to production. Discharging the interim and discharging this treatment are the same action."_

**What IS proposed now.** Run the first real infrastructure change through the **changeset-armed release-PR route** — an infra change carries a changeset for `packages/deployment`, and merging the resulting release PR is the apply — sequenced behind a plan read before the merge. Until `.github/workflows/release-pr-plan.yml` exists that plan is a `terraform-plan.yml` dispatch; after it exists it is the plan posted on the release PR itself. The plan is read by the change's own author to check their work, not signed off by anyone else — see the `addressr-maintainer` persona's no-review-by-default constraint.

**Why the route changed, and why that does not discharge this entry.** User-directed 2026-08-10: _"I don't want it being a flag that the agent has to provide from our local machine. The change sets should determine what does and doesn't trigger and deploy."_ `deploy_only` is removed in Phase 4 of that work, so an exercise conducted through it would prove a path that no longer exists on the day it was proven. **The hazard survives the substitution and must be re-scored against the successor, not closed with the predecessor.** The property this entry names — the sole route to a production infrastructure apply has carried no real infrastructure mutation of its own — transfers intact: the changeset-armed route has carried none either, and it starts from a lower base than `deploy_only`, whose plumbing was at least run on 2026-08-05. Deleting an unproven route and replacing it with a differently-unproven one moves this risk; it does not retire it. Re-score at the Phase 4 commit rather than closing.

Recorded on [JTBD-400](../jtbd/addressr-maintainer/JTBD-400-ship-releases-reliably-from-trunk.validated.md) (commit `09f6418`), which carries the same directive from the corpus side.

## Monitoring

- **Trigger to re-assess**: the first apply carrying a **non-empty plan** on whichever route is then current, or any change to the deploy-gating expression in `release.yml`. **RE-POINTED 2026-08-10 (second revision, same date)** — the trigger read _"the first `deploy_only=true` dispatch carrying a **non-empty plan** (the spent trigger — 'the first dispatch' — fired 2026-08-05 and retired only the plumbing)"_, which Phase 4 makes unreachable by deleting the input it names. Stated route-agnostically so it survives the substitution; the Phase 4 commit is itself a change to the deploy-gating expression and therefore fires the second clause. Deliberately NOT "a new pipeline hint with this risk_slug" — that fires on scorer activity rather than on the hazard (P083).
- **Metrics**: applies carrying a **non-empty** plan, on any route: **zero**. Broken down by route so the substitution stays visible — `deploy_only` dispatches whose `Deploy new version` concluded `success`: **two** as of 2026-08-05, both on an empty plan, and that count is frozen because the input is removed at Phase 4. Changeset-armed release-PR merges reaching the deploy step: **zero**, on a route that does not yet exist. Also track the smoke gate's false-red rate, **1 in 2** on the only sample that exists.

## Related

- Criteria: `RISK-POLICY.md`
- Absorbs: **R025** (deploy axis armed, JTBD-400 manual deploy path unexercised), retired 2026-08-04 into this entry — its own description already cited R020.
- Treatment ADRs: **ADR-001** (risk-gated release process), whose 2026-07-27 amendment authorised the push-tier apply; **ADR-040** (release-pipeline change-type action matrix), which created the axis.
- Siblings: **R021** (the axis's governance level) and **R022** (unstaged `deploy/**` drift arming it). Distinct hazards on the same machinery — see P083 for why they are not consolidated.
- Precedent: **R010** — the same "we will exercise the fallback later" shape, closed 2026-08-02 by actually running the drill.
- Personas affected: `docs/jtbd/addressr-maintainer/`

## Evidence Log

Auto-populated from `.risk-reports/` via Phase 2b drain.

- 2026-07-27T01:07:31Z: fired in `.risk-reports/2026-07-27T01-07-31-commit.md` (reason: user-stated-precondition)

## Change Log

- 2026-08-10: **RE-SCOPED and RE-SCORED UPWARD — 8 → 10, above appetite.** The `deploy/**` push axis retired ([R021](R021-push-tier-deploy-axis-arms-prod-terraform-apply.retired.md), [ADR 001](../decisions/001-risk-gated-release-process.proposed.md) and [ADR 040](../decisions/040-release-pipeline-change-type-action-matrix.proposed.md) 2026-08-10 amendments). This entry's own Monitoring trigger — _"any change to the deploy-gating expression in `release.yml`"_ — fired, so this re-rate is the entry's own instruction rather than an imposition.

  **This entry does NOT retire with R021, and the direction of travel is the opposite one.** R021's hazard was the axis existing; this entry's hazard is the recovery path failing when reached for. Deleting the axis discharges the first and _intensifies_ the second: `deploy_only` stops being a fallback and becomes the only route to an infrastructure apply.

  **Impact 4 → 5 on the entry's own stated ground.** The 4 was held explicitly _"because the primary path is now proven and would usually be available"_. It is not available any more. Likelihood is unchanged at 2 — nothing about the retirement makes the dispatch more or less likely to fail; it changes what failing costs.

  **The uncomfortable fact, recorded rather than smoothed over.** The retired axis is the path with real applies — six, five successful. This entry's own path has been exercised twice, **both against a plan that changed nothing**, and has never carried a real infrastructure mutation. The 2026-08-10 change therefore makes the _less_-proven path the only path, for a bounded interim. That is a deliberate trade and it is priced here rather than argued away.

  **Treatment is unchanged and now urgent rather than outstanding.** Run the first real infrastructure change through `deploy_only` as this entry's named non-empty-plan exercise, sequenced behind a `terraform-plan.yml` baseline dispatch — which, with R021 retired, is the only plan review left on any path to production. Discharging the interim and discharging this entry's treatment are the same action.

- 2026-08-09 (second entry today): Re-verified against R021's treatment ratification — the maintainer chose to harden the axis's per-disjunct preconditions rather than add a plan-approval gate or accept above appetite, and the second precondition (`source_hash` over the deployment bundle's manifest) landed with it. **This entry's citation holds**: this entry cites R021 for the axis's governance level and for the apply count, and none of that is reached by a treatment choice. Recorded because R021's Treatment and Controls both took body edits, so the fence correctly required its referrers in the same commit.

  Worth noting rather than leaving implicit: **R021's residual did not move.** It stays at 10 and above appetite, because Impact is fixed at 5 while nothing on that path reviews the plan. A reader arriving here from this entry should not infer that the hardening closed the gap — it strengthened the Controls section and left the score alone.

- 2026-08-09: Re-verified against R028's body change of the same date, which widened the review fence to walk committed history and date an entry at its last change outside its Change Log. **This entry's citation holds** — this entry cites R028 for the claim-scoped-sweep discipline behind its canonical-state table, and widening a check's timestamp source touches no claim about drift or about this entry's subject.

  Recorded because R028's edit was a genuine body move, so the fence correctly required its referrers to be revisited. Under the widened rule this bullet does **not** make this entry a moved target in turn, which is the whole point of the change: before it, exactly this remedy re-armed the check one hop further out, without a fixed point.

- 2026-08-09: **Apply count 4 → 5 across all four sites, in the same commit as R021's re-rate.** R021 moved its canonical `Metrics` cell to five (four successful, one failed) after its Monitoring trigger fired on run `31252424980`. This entry states that count in four places — the axis-half paragraph, the canonical-state table, the load-bearing Control, and the Treatment's not-proposed clause — and all four moved together. Split across commits the review fence would have passed by construction, because it counts uncommitted files as current; that is the failure mode R028 records against itself and the reason for the single-commit rule here.

  **This entry's own score is UNCHANGED at 4 × 2 = 8, and that is a decision rather than an omission.** The Control the failure touches is credited for holding Impact at 4 instead of 5, on the grounds that a working primary path makes `deploy_only` a fallback rather than the only route. A primary path that failed once, auto-rolled back, and had its cause fixed is still available, so the grounds hold. Likelihood is untouched because the failure was on the primary path and says nothing about whether the recovery path completes under a real plan — which remains this entry's unproven half.

  Contradicting phrasings were widened in the canonical-state table rather than replaced, so the four-era wordings are now caught alongside the three-era ones.

- 2026-08-08: Re-verified against R021's same-day change (its Monitoring re-assess trigger fired on run `31252424980`, a push-tier apply that failed by deploying an unpublished version; mechanism fixed, re-rate tracked on P095). **This entry's citation of R021 still holds**: the failure does not change what R021 is about, only its likelihood, and R021 now says of itself at its own surface that its residual understates until the re-rate lands. No cardinal here is affected.
- 2026-07-27: Auto-scaffolded by the Phase 2b drain (ADR-056, plugin-scoped). Pending human curation.
- 2026-08-04: Curated, **re-scoped, and R025 merged in and retired**. Both halves of the premise were checked against the Actions history rather than assumed. The axis half is DISCHARGED: three successful production applies (`33e6c04`, `96e965c`, `2e557b9`), each verified by reading the `Deploy new version` step's conclusion. The recovery half is NOT: all four `workflow_dispatch` runs skipped every deploy step, so `deploy_only=true` has never been dispatched. Scored 12 inherent / 8 residual, above appetite, with a one-action treatment. Curated as part of the P083 register drain.
- 2026-08-05: **Treatment PARTIALLY discharged; residual held at 8.** A first draft scored it 8 → 4 and stamped DISCHARGED. The risk scorer withdrew that: both exercises ran against an empty plan, so only the plumbing sub-hazard retired, and the smoke flake contributes to this entry's own Impact-4 recovery delay rather than being purely R015's. Scoring the label ("the path was exercised") over the configured value ("exercised twice on a no-op plan, with a 1-in-2 red on its own verification step") is the same move ADR-001 corrected when a `DeploymentPolicy` named "Rolling" was credited for a partial-fleet blast radius. Exercised twice (runs `30989443618`, `30991052224`) after a `terraform-plan.yml` baseline confirmed an empty change set. Recorded what the exercise did not prove (no real mutation carried) and what it found (a flaky production smoke gate, healthy service, degraded runner egress) rather than reporting a clean pass.
- 2026-08-05: Cross-references to R021 and R022 re-verified after both moved. The ownership claims are untouched — R021 owns who can start an apply, R022 unreviewed apply content, this entry the recovery path. **The base rate was NOT untouched, and an earlier version of this bullet wrongly said it was**: this entry states the axis base rate in three places and all three moved 3 → 4, which is precisely the sentence-level drift the fence cannot see and the file-level flag was pointing at. Recorded per the review-fence check.
