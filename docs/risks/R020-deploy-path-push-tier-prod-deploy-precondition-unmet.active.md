# Risk R020: The manual `deploy_only` recovery path is exercised only against a no-op plan

> **Filename retained deliberately.** The `<slug>` is the dedupe key the ADR-056 Phase 2b drain matches on, so renaming would let the same hazard re-scaffold as a new entry. The H1, the README row and the body carry the corrected scope.

**Status**: Active — RE-SCOPED 2026-08-04 (absorbs R025); treatment PARTIALLY discharged 2026-08-05 — the path was exercised, against a plan that changed nothing
**Category**: operational (ISO 31000) — production infrastructure change control
**Identified**: 2026-07-27
**Owner**: addressr-maintainer
**Last reviewed**: 2026-08-05
**Next review**: 2027-02-04
**Curation**: human-curated 2026-08-04 (superseding the auto-scaffolded pending-review state)

## Description

ADR-001 Amendment 2026-07-27 authorises a `deploy/**` push-tier production Terraform apply while JTBD-400's "exercise the manual --deploy-only path first" precondition is unmet (zero dispatches); deferral lifted by user 2026-07-26 rather than satisfied.

> **Origin.** Auto-scaffolded by the Phase 2b drain (`wr-risk-scorer` ADR-056) from a
> `wr-risk-scorer:pipeline` RISK_REGISTER_HINT bullet. The scoring fields **carried** the
> ADR-026 ungrounded-output sentinel until the curation recorded in the Change Log below;
> they are grounded now. The original description was the agent's prefill.

## What changed, measured rather than assumed

The entry's premise was a conjunction: the `deploy/**` push-tier axis is **armed** while JTBD-400's "exercise the manual `--deploy-only` path first" precondition is **unmet**, with the deferral lifted by user direction on 2026-07-26 rather than satisfied. R025 says the same thing in fewer words and names R020 in its own description, so the two are merged here.

Both halves were checked against the GitHub Actions history rather than reasoned about, and they have diverged:

**The axis half is discharged.** The push-tier trigger has now fired on production four times, all successful — the ADR-041 cutover (`33e6c04`), the two staged `addressr5` decommission applies (`96e965c`, `2e557b9`), and `50f1360` clearing R022's held drift against an empty plan, which exercised the trigger rather than an apply. Confirmed by reading each run's `release` job: the `Deploy new version` step concluded `success` on all four. The mechanism works; it is no longer an untested path.

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

| Fact                        | Value                                 | Contradicting phrasings                                                                                                     |
| --------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `deploy_only` recovery path | exercised 2026-08-05, empty plan only | has never been exercised; remains at zero exercises; never been dispatched; is the one still unproven; recovery half is not |
| push-tier axis applies      | four, one of them an empty plan       | fired on production three times; EVIDENCED, three production applies; three successful applies are evidence                 |

## Inherent Risk

Impact × Likelihood _before_ controls.

- **Impact**: 4 (Significant) — this is a _recovery-path_ risk, not a primary-path one. The realisation is: the push-tier axis is unavailable or unsafe (a red master, a revert in flight, an infra-only fix needed with no code change to push), the operator reaches for `deploy_only`, and it does not work. That is a delayed recovery during an incident, not an outage in itself. Below the Severe band because the primary path is now proven and would usually be available.
- **Likelihood**: 3 (Possible) — an unexercised path is not a working path. Before 2026-08-05 nothing had ever run those three steps under a dispatch, so a defect in the gating expression, the input plumbing, or the risk-gate's `release:watch` command-prefix interception would surface for the first time under incident pressure.
- **Inherent Score**: 12
- **Inherent Band**: High

## Controls

- **The push-tier axis is proven — EVIDENCED, four production applies: three that applied a reviewed plan plus one (`50f1360`) that ran against an empty plan and applied nothing.** This is the control that changed the score, so the qualifier is load-bearing rather than pedantic — an unqualified "four" credits the label where the configured value is three. A working primary path means the recovery path is a fallback rather than the only route, which is what holds impact at 4 instead of 5.
- **`release-workflow-deploy-only.test.mjs` pins the gating expression — EVIDENCED.** It asserts the boolean is compared unquoted (`inputs.deploy_only == true`, never `== 'true'`), which is the trap that would make the gate silently never fire and take the run **green with the deploy skipped**. It also pins the three-gate occurrence count, the `deploy-paths` step id, its push-event scoping and its fail-closed missing-parent guard. Runs in CI on every push.
- **NOT a control: the four pre-2026-08-05 dispatches.** They exercised the workflow, not the path. Every one skipped all three deploy steps, so they demonstrate that `deploy_only` was absent rather than that it works. Counting them would be exactly the error this entry exists to name. The two 2026-08-05 dispatches DID run the path and are credited in the Residual section — for the plumbing only, since both ran against an empty plan.

## Residual Risk

Impact × Likelihood _after_ controls.

- **Impact**: 4 (Significant) — unchanged. No control shortens a recovery that fails when reached for.
- **Likelihood**: 2 (Unlikely) — **held at 2, not dropped to 1, and the reason is in this entry's own text.** The path was exercised on 2026-08-05 and the plumbing works: Two `deploy_only=true` dispatches: run `30989443618` and run `30991052224`. In both, the publish steps skipped and `Deploy new version`, `Wait for deployment to stabilize` and the smoke ran rather than skipped — the gate resolves true and everything downstream of it executes. The second run completed green end to end. "Everything downstream of the gate", which the previous likelihood called unproven, is now measured **for dispatch, gating and step-entry**.

  Two things stop it reaching 1. First, **both exercises ran against a plan that changed nothing**, so step-_completion_ under a real plan is still unproven — that is where R003's `version_label` binding fires, the EB fleet cycles at `BatchSize = 100 Percentage`, and stabilise and smoke have something to actually wait on. A different execution profile, not a longer version of the same one. Second, **the smoke flake is partly this entry's hazard, not only R015's**: an operator reaching for `deploy_only` mid-incident gets a successful deploy and a red run on a healthy service, and under incident pressure cannot distinguish "recovery failed" from "runner egress flaked". That produces exactly the delayed recovery this entry's Impact 4 is defined as — arriving by a route an earlier draft of this section disclaimed.

- **Residual Score**: 8
- **Residual Band**: Medium
- **Within appetite?**: **No** — appetite is 5 inclusive.

### What the exercise did NOT prove, and one thing it found

The apply was a **no-op by design**: a baseline `terraform-plan.yml` dispatch beforehand reported _"No changes. Your infrastructure matches the configuration"_, and the deploy step's own plan agreed. So the run proves the **plumbing** — dispatch, input honoured, publish skipped, deploy/stabilise/smoke reached — and does **not** prove the path can carry an actual infrastructure mutation. That is the honest remaining gap, and it is smaller than the one it replaces.

**The first run FAILED, and not because of the recovery path.** Run `30989443618` failed at `Smoke test production`: `/api-docs` took **9m18s** to answer and `/debug/shadow-config` then returned HTTP ≥400 (curl exit 22) after ~5 minutes of retries. Terraform had changed nothing, so production was untouched by the run. Probed directly at the same time, production was healthy — `/health`, `/api-docs` and `/debug/shadow-config` all 200 in under 300 ms. The runner saw a degraded edge; the service was fine. The identical dispatch fifteen minutes later passed.

That is a **flaky production smoke gate, observed once in two runs**, and it matters beyond this entry: per [R015](R015-npm-publish-coupled-to-prod-deploy-p039-unresolved.active.md) the smoke runs _after_ npm publish and the production deploy, so a flake reports a release as failed when it has in fact shipped — inviting an unnecessary rollback. Its release-reporting face belongs to [R015](R015-npm-publish-coupled-to-prod-deploy-p039-unresolved.active.md), whose `Smoke test production` control credit now carries the measured false-red rate, with the fix tracked on P039. Its **incident-ambiguity** face is this entry's, and is priced in the Likelihood above.

## Treatment

**Mitigate — treatment PARTIALLY discharged 2026-08-05.** The named treatment was one action: dispatch `release.yml` with `deploy_only=true` and confirm the three steps run rather than skip. Done, twice, via the documented `npm run release:watch -- --deploy-only` route.

It was as cheap as predicted: a no-op apply against already-deployed code on a green master, at a time of choosing rather than during an incident. Sequenced deliberately — a `terraform-plan.yml` baseline first, so the change set was known to be empty before anything ran that could apply. That plan step is the approval gate [R021](R021-push-tier-deploy-axis-arms-prod-terraform-apply.active.md) records the axis as lacking, performed by hand.

Remaining, and smaller than what it replaced: the path has never carried a real infrastructure mutation, and the smoke gate flaked once in two runs.

Deliberately NOT proposed: removing the push-tier axis or re-imposing the deferral. The axis is now the proven path and four successful applies are evidence for keeping it — three that applied a reviewed plan plus one (`50f1360`) that ran against an empty plan and applied nothing.

## Monitoring

- **Trigger to re-assess**: the first `deploy_only=true` dispatch carrying a **non-empty plan** (the spent trigger — "the first dispatch" — fired 2026-08-05 and retired only the plumbing), or any change to the deploy-gating expression in `release.yml`. Deliberately NOT "a new pipeline hint with this risk_slug" — that fires on scorer activity rather than on the hazard (P083).
- **Metrics**: `workflow_dispatch` runs whose `Deploy new version` concluded `success` — **two** as of 2026-08-05, both on an empty plan. The metric that now matters is runs carrying a **non-empty** plan: **zero**. Also track the smoke gate's false-red rate, **1 in 2** on the only sample that exists.

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

- 2026-07-27: Auto-scaffolded by the Phase 2b drain (ADR-056, plugin-scoped). Pending human curation.
- 2026-08-04: Curated, **re-scoped, and R025 merged in and retired**. Both halves of the premise were checked against the Actions history rather than assumed. The axis half is DISCHARGED: three successful production applies (`33e6c04`, `96e965c`, `2e557b9`), each verified by reading the `Deploy new version` step's conclusion. The recovery half is NOT: all four `workflow_dispatch` runs skipped every deploy step, so `deploy_only=true` has never been dispatched. Scored 12 inherent / 8 residual, above appetite, with a one-action treatment. Curated as part of the P083 register drain.
- 2026-08-05: **Treatment PARTIALLY discharged; residual held at 8.** A first draft scored it 8 → 4 and stamped DISCHARGED. The risk scorer withdrew that: both exercises ran against an empty plan, so only the plumbing sub-hazard retired, and the smoke flake contributes to this entry's own Impact-4 recovery delay rather than being purely R015's. Scoring the label ("the path was exercised") over the configured value ("exercised twice on a no-op plan, with a 1-in-2 red on its own verification step") is the same move ADR-001 corrected when a `DeploymentPolicy` named "Rolling" was credited for a partial-fleet blast radius. Exercised twice (runs `30989443618`, `30991052224`) after a `terraform-plan.yml` baseline confirmed an empty change set. Recorded what the exercise did not prove (no real mutation carried) and what it found (a flaky production smoke gate, healthy service, degraded runner egress) rather than reporting a clean pass.
- 2026-08-05: Cross-references to R021 and R022 re-verified after both moved. The ownership claims are untouched — R021 owns who can start an apply, R022 unreviewed apply content, this entry the recovery path. **The base rate was NOT untouched, and an earlier version of this bullet wrongly said it was**: this entry states the axis base rate in three places and all three moved 3 → 4, which is precisely the sentence-level drift the fence cannot see and the file-level flag was pointing at. Recorded per the review-fence check.
