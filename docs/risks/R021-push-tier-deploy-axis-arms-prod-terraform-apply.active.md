# Risk R021: The push-tier deploy axis runs a production apply at the lowest governance of the three entry points

**Status**: Active
**Category**: operational (ISO 31000) — production infrastructure change control
**Identified**: 2026-07-27
**Owner**: addressr-maintainer
**Last reviewed**: 2026-08-05
**Next review**: 2027-02-04
**Curation**: human-curated 2026-08-04 (superseding the auto-scaffolded pending-review state of 2026-07-27)

## Description

The ADR-040 stage-3 deploy/** axis adds a push-tier trigger for a full prod Terraform apply against live EB, OpenSearch and Cloudflare, at lower governance than the other two entry points and with no plan-approval gate or blue/green on that path.

> **Origin.** Auto-scaffolded by the Phase 2b drain (`wr-risk-scorer` ADR-056) from a
> `wr-risk-scorer:pipeline` RISK_REGISTER_HINT bullet. The scoring fields **carried** the
> ADR-026 ungrounded-output sentinel until the curation recorded in the Change Log below;
> they are grounded now. The original description was the agent's prefill.

## Three entry points, and this is the cheapest one

A production `terraform apply` can start three ways, and `release.yml` gates them differently:

| Entry point     | Gate                                           | What it takes to trigger                                                                                         |
| --------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Publish         | `steps.changesets.outputs.published == 'true'` | Merge a release PR — a deliberate, reviewed act                                                                  |
| Manual dispatch | `inputs.deploy_only == true`                   | Tick a box in the Actions UI, release-tier gating, intercepted by the risk gate's `release:watch` command prefix |
| **Push**        | `steps.deploy-paths.outputs.changed == 'true'` | **Push any commit touching `deploy/**`**                                                                         |

The third is this entry. It is the only one where a routine `git push` reaches production infrastructure, and it carries **no plan-approval step and no blue/green** on that path — a whole-root-module apply against the live Elastic Beanstalk environment, the AWS-managed OpenSearch domain and the Cloudflare worker.

The asymmetry is deliberate (ADR-040 stage 3, authorised by ADR-001's 2026-07-27 amendment) and it buys something real: an infra change lands with its code in one commit rather than needing a second manual step that someone has to remember. The risk is the price of that.

## Base rate — it has fired, and it has worked

Not hypothetical, and not unproven either. The axis has run four production applies, all successful: `33e6c04` (ADR-041 cutover), `96e965c` and `2e557b9` (the two staged `addressr5` decommission applies), and `50f1360` (clearing R022's held comment drift, run `31002259787`). **The fourth is not equivalent to the first three**: its plan was empty, so it exercised the trigger and the pipeline rather than an apply. Each verified by reading the `Deploy new version` step's conclusion in that run's `release` job.

Three-real-plus-one-empty matters in both directions. It is evidence the mechanism works, and it is a small sample against a Severe impact — smaller than the cardinal suggests, since only three of the four actually applied anything — which is why the residual below is not driven down to Rare on the strength of it.

## Inherent Risk

Impact × Likelihood _before_ controls.

- **Impact**: 5 (Severe) — a whole-root-module apply against the live search backend. `RISK-POLICY.md` names OpenSearch data loss requiring re-indexing at Impact 5, and an unreviewed apply against the domain reaches that. There is no plan-approval gate on this path to catch a destructive plan before it runs.
- **Likelihood**: 3 (Possible) — the trigger is a routine `git push`, which is the most frequent action in the repository. Any commit touching `deploy/**` arms it, including one whose author is thinking about something else entirely.
- **Inherent Score**: 15
- **Inherent Band**: High

## Controls

- **Path-scoped detection, fail-closed — EVIDENCED.** The step diffs `github.event.before..GITHUB_SHA -- deploy/` and fails closed on an unresolvable parent (`git cat-file -e`), so branch creation and force-pushed parents yield `changed=false` rather than an accidental arm. `fetch-depth: 0` is load-bearing: at shallow depth a `deploy/**` change in any but the tip commit of a multi-commit push would be invisible.
- **Provider-lockfile exclusion, announced — EVIDENCED.** `deploy/.terraform.lock.hcl` is excluded by name, and the exclusion emits a `::notice::` pointing at the release-tier dispatch, so it can never be a silent no-deploy. This removes the highest-frequency incidental trigger.
- **Pinned in CI — EVIDENCED.** `test/js/__tests__/release-workflow-deploy-only.test.mjs` asserts the step id the gate reads, its `push`-event scoping, the fail-closed guard, `fetch-depth: 0`, and the three-gate occurrence count. It also pins the boolean comparison unquoted, which is the trap that would make a gate silently never fire and take the run **green with the deploy skipped**.
- **The commit-tier risk gate runs first — PARTIALLY credited.** A `deploy/**` commit is scored before it can be pushed. It is real and it fires, but it is one tier below the release-tier review this path skips, and P086 (2026-08-04) showed a governed command wrapped in a shell construct evades the gate entirely. Credited for what it is, not for what the release tier would have given.

## Residual Risk

Impact × Likelihood _after_ controls.

- **Impact**: 5 (Severe) — irreducible, and this is where the unclosed gap lives. Every control here bounds whether an apply _starts_, not what one does once running. **Nothing on this path reviews the plan**, so there is no route to a lower impact short of adding one — which ADR-040 weighed and declined. That fixes the entire Impact-5 column: the reachable scores are 5, 10, 15, 20, 25, and 5 is the floor.
- **Likelihood**: 1 (Rare) — the controls close the accidental-arm routes (lockfile churn, malformed parent, shallow fetch), and what remains is a deliberate `deploy/**` change, which is the case the axis exists to serve. **The applies carry no weight here**, and the reason is worth stating: they test whether the _mechanism_ works, not whether a _bad plan_ would be caught, because none of the four carried one — three applied a reviewed plan and the fourth applied nothing at all. Against this hazard the sample is zero, not four.
- **Residual Score**: 5
- **Residual Band**: Medium per `RISK-POLICY.md`'s table (Low under the scorer's ADR-086 bands)
- **Within appetite?**: Yes, at the line. Appetite is 5, inclusive.

**The live question is 1 versus 2, not 5 versus lower.** An earlier draft defended "held at 5 rather than below", which describes a choice the matrix does not offer — with Impact fixed at 5 and Likelihood already at the floor, 5 _is_ the minimum attainable score, and the only route beneath it is arguing Impact ≤ 4, which this entry rejects. The risk scorer caught the misdirection during review. The real question is whether Rare survives, and the answer rests on the closed accidental-arm routes above rather than on the base rate.

## Treatment

**Accept**, with the asymmetry recorded rather than smoothed over.

The alternative — a plan-approval step on the push path — would eliminate the benefit the axis exists for, which is that an infra change lands atomically with its code. ADR-040 weighed that and chose the axis; this entry prices the option ADR-040 picked, which is what ISO 31000 § 6.4.3 asks for. A re-open would come from ADR-040's own reassessment criteria, not from this scoring.

The operative control is not on this path at all: **keep `deploy/**` out of unrelated commits**, which is R022's subject and where the exposure was concentrated until that instance was cleared 2026-08-05; the class remains.

**Name the seam, because the pair has a soft joint.** This entry's Treatment points at R022; R022's Treatment says its own mitigation is incomplete and rests on "only the maintainer's habit". So the chain terminates in a procedural control that R022 explicitly declines to credit. That is not double-counting and it does not undermine the Likelihood 1 above — that rests on the fail-closed detection, not on the habit — but a reader should see that the pair's _combined_ residual has an uncredited joint in the middle. That condition ran from 2026-08-02 until 2026-08-05, when `deploy/main.tf` and `deploy/vars.tf` were committed (`50f1360`) against a verified-empty plan. It was held out of every commit until then by a stated pathspec and nothing else — which is the point: the habit held, and a habit is not a mechanism.

## Monitoring

- **Trigger to re-assess**: a push-tier apply that fails or produces an unintended change (the first such event moves likelihood off Rare immediately), or any edit to the deploy-detection step or its gating expression. Deliberately NOT "a new pipeline hint with this risk_slug" — that fires on scorer activity rather than on the hazard, which is why this register sat uncurated (P083).
- **Metrics**: count of push-tier applies and their outcomes. Four, all successful, as of 2026-08-05 — the fourth against an empty plan, so it exercises the trigger and pipeline rather than the apply.

## Related

- Criteria: `RISK-POLICY.md`
- Treatment ADRs: **ADR-040** (release-pipeline change-type action matrix) created the axis — note it is still `.proposed.md` — undischarged Confirmation items are P076's subject (R026 retired 2026-08-05); **ADR-001** (risk-gated release process) authorised it in its 2026-07-27 amendment, naming the entry point and its push-tier score.
- Siblings, deliberately NOT consolidated (see P083): **R022** — unstaged `deploy/**` drift reaching this trigger, which is where the exposure was concentrated until that instance was cleared 2026-08-05; the class remains; **R020** — the manual `deploy_only` recovery path, proven only against a no-op plan; **R003** — what an apply does to EB once running, which fires on all three entry points.
- Personas affected: `docs/jtbd/addressr-maintainer/`

## Evidence Log

Auto-populated from `.risk-reports/` via Phase 2b drain.

- 2026-07-27T01:18:00Z: fired in `.risk-reports/2026-07-27T01-18-00-commit.md` (reason: above-appetite-residual)

## Change Log

- 2026-07-27: Auto-scaffolded by the Phase 2b drain (ADR-056, plugin-scoped). Pending human curation.
- 2026-08-05: Cross-references to R020 and R022 re-verified after both declared canonical state. Both citations hold, and this entry is the sharpest case for why the declaration was worth building: the Siblings clause below describes R020's path as "proven only against a no-op plan" and R022's instance as cleared with the class standing — and **those are exactly the two values R020 and R022 now declare canonically**. The stale version of that same clause, saying R020's path had "never been exercised", was caught earlier today by the risk scorer reading an inbound reference, not by any sweep. The clause a human had to catch in a second file is now one a machine holds in the first. Recorded per the review-fence check.
- 2026-08-05: Siblings clause corrected — it described R020's `deploy_only` path as "never exercised" after that path was exercised on 2026-08-05. Found by the risk scorer, not by the sweep: this entry was an inbound reference living outside the entry that changed.
- 2026-08-05: Base rate extended to a fourth successful application. The axis fired on `50f1360` to clear R022's four-day `deploy/**` drift — deliberately, against a plan verified empty on four prior runs, and run `31002259787` applied nothing. **Recorded as weaker evidence than the three cutover applies, not as a fourth equivalent point**: an empty plan exercises the trigger and the pipeline, not the apply. The Accept treatment is unchanged.
- 2026-08-04: Curated. Scored 15 inherent / 5 residual, at the appetite line, Treatment **Accept**. The base rate is three successful production applies (`33e6c04`, `96e965c`, `2e557b9`), each verified by reading the `Deploy new version` step's conclusion — evidence the mechanism works, and a small sample against a Severe impact, so likelihood is not driven below Rare on it. 5 is the floor of the Impact-5 column, so the live question was Likelihood 1 versus 2; the risk scorer corrected a draft paragraph that defended "held at 5 rather than below", a choice the matrix does not offer. Rare rests on the closed accidental-arm routes, not on the base rate — three applies test the mechanism, not a bad plan, so against this hazard the sample is zero. Curated as part of the P083 register drain.
