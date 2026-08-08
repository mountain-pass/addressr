# Risk R021: The push-tier deploy axis runs a production apply at the lowest governance of the three entry points

**Status**: Active
**Category**: operational (ISO 31000) — production infrastructure change control
**Identified**: 2026-07-27
**Owner**: addressr-maintainer
**Last reviewed**: 2026-08-09
**Next review**: 2026-11-09
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

## Base rate — it has fired five times, and the fifth one failed

Not hypothetical, and no longer unblemished. The axis has run five production applies, four successful: `33e6c04` (ADR-041 cutover), `96e965c` and `2e557b9` (the two staged `addressr5` decommission applies), and `50f1360` (clearing R022's held comment drift, run `31002259787`). **The fourth is not equivalent to the first three**: its plan was empty, so it exercised the trigger and the pipeline rather than an apply. Each verified by reading the `Deploy new version` step's conclusion in that run's `release` job.

**The fifth failed.** Run `31252424980`, 2026-08-08: a `deploy/**` push deployed a version that had never been published, because `changeset version` had bumped the job's working tree while authoring the release PR and the `deploy/**` disjunct carried no version guarantee. Elastic Beanstalk ran `npm install` for a nonexistent version and failed on both instances. `RollbackLaunchOnFailure` held and production kept serving. Recorded as P095; the mechanism is fixed (`deploy/resolve-version.sh`, ADR-040 amendment 2026-08-08).

Four-successful-plus-one-failed matters in three directions, not two. It is evidence the mechanism works; it is a small sample against a Severe impact — smaller than the cardinal suggests, since only four of the five applied anything at all; and it is now a **realised** failure of exactly the kind the Monitoring trigger names, which is what moves the Residual Likelihood below off Rare.

**What the failure did and did not prove.** It did not demonstrate a destructive plan reaching production — the plan was correct and the payload was wrong, which is a different mechanism from the one the Impact 5 below is defined against. What it did demonstrate is that this path can carry an unintended change into production with nothing on the path to catch it, which is the whole of what "no plan-approval gate" means in practice. Treating it as unrelated because the specific route is now fixed would be scoring the hop rather than the path.

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
- **Deployed version resolves from the registry, not the working tree — EVIDENCED, added 2026-08-08.** `deploy/resolve-version.sh` reads the published `latest` dist-tag rather than `npm_package_version`, and `deploy/deploy.sh` applies the resolved value at all four consumers (tfvar, manifest version, dependency pin, zip name). `test/js/__tests__/deploy-version-resolution.test.mjs` runs the resolver against a stub registry and asserts all four agree, including the fail-closed paths. This closes the route that fired on run `31252424980`. Credited for that route only — see the Residual note on why it does not restore Rare.
- **The commit-tier risk gate runs first — PARTIALLY credited.** A `deploy/**` commit is scored before it can be pushed. It is real and it fires, but it is one tier below the release-tier review this path skips, and P086 (2026-08-04) showed a governed command wrapped in a shell construct evades the gate entirely. Credited for what it is, not for what the release tier would have given.

## Residual Risk

Impact × Likelihood _after_ controls.

- **Impact**: 5 (Severe) — irreducible, and this is where the unclosed gap lives. Every control here bounds whether an apply _starts_, not what one does once running. **Nothing on this path reviews the plan**, so there is no route to a lower impact short of adding one — which ADR-040 weighed and declined. That fixes the entire Impact-5 column: the reachable scores are 5, 10, 15, 20, 25, and 5 is the floor.
- **Likelihood**: 2 (Unlikely) — **moved off Rare 2026-08-09, as this entry's own Monitoring trigger instructed.** The controls still close the accidental-arm routes (lockfile churn, malformed parent, shallow fetch), and what remains is a deliberate `deploy/**` change, which is the case the axis exists to serve. What has changed is that one of the five applies carried an unintended change into production. Rare was never defended on the base rate — it rested on the closed accidental-arm routes — but it is not available against an observed one-in-five, because the realised event arrived through none of the routes those controls close. It came through a route nobody had enumerated.
- **Residual Score**: 10
- **Residual Band**: High per `RISK-POLICY.md`'s table
- **Within appetite?**: **No.** Appetite is 5, inclusive. See Treatment.

**The question was 1 versus 2, and it is now settled at 2.** An earlier draft defended "held at 5 rather than below", which describes a choice the matrix does not offer — with Impact fixed at 5 and Likelihood already at the floor, 5 _was_ the minimum attainable score, and the only route beneath it is arguing Impact ≤ 4, which this entry still rejects. The risk scorer caught that misdirection during review, and the framing survives the re-rate intact: the live axis was always Likelihood, and an event decided it.

**Why the P095 fix does not buy Rare back.** `deploy/resolve-version.sh` closes the version-resolution route and is pinned by `test/js/__tests__/deploy-version-resolution.test.mjs`, which asserts the resolved version reaches all four consumers. That is a real control and it is credited above in the sense that this specific route will not recur. It does not restore Rare, because the argument for Rare was an enumeration of closed routes, and the event proved that enumeration incomplete. A control that closes the fifth route does not re-establish a claim that rested on there being no sixth.

## Treatment

**Mitigate — changed from Accept 2026-08-09, because Accept is not available above appetite.** The residual is 10 against an appetite of 5, and the change is forced by this entry's own Monitoring trigger firing, not by a re-argument of the scoring.

**One mitigation has landed and is credited above**: `deploy/resolve-version.sh` closes the version-resolution route that fired, pinned by `deploy-version-resolution.test.mjs`. It is not sufficient on its own — it moves this entry from "a realised failure with the route open" to "a realised failure with that route closed", which is why the residual is 10 rather than 15, and not why it would be 5.

**The gap that keeps it above appetite is unchanged and is the one this entry has always named**: nothing on this path reviews the plan. Closing it requires a decision the maintainer owns, because the two available options trade against each other and against ADR-040's stated intent:

| Option                                                                                                                                                | Effect on residual                                | Cost                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Plan-visibility gate** — run `terraform plan` as a separate step on the push path and fail on a non-empty plan unless an explicit marker is present | Likelihood 2 → 1, residual **5**, within appetite | Removes the atomicity ADR-040 chose the axis for, on exactly the changes where it matters most. Needs an ADR-040 amendment or supersession.               |
| **Accept above appetite, explicitly and on the record**                                                                                               | Residual stays **10**                             | A deliberate maintainer decision recorded as such, not an omission. Requires the ADR-001 / ADR-040 authorisation to say so, since neither currently does. |

**Not proposed: removing the axis.** ADR-040 weighed that and chose the axis; this entry prices the option ADR-040 picked, which is what ISO 31000 § 6.4.3 asks for. The realised failure does not overturn that judgement — it prices it correctly for the first time.

**Awaiting maintainer ratification.** Neither option is the agent's to pick: one supersedes a confirmed decision, and the other is an explicit above-appetite acceptance, which per this project's standing direction is not something an agent may choose on the maintainer's behalf. Until it is picked, this entry sits above appetite with the treatment named rather than applied, and that state is deliberate rather than an oversight.

The operative control is not on this path at all: **keep `deploy/**` out of unrelated commits**, which is R022's subject and where the exposure was concentrated until that instance was cleared 2026-08-05; the class remains.

**Name the seam, because the pair has a soft joint.** This entry's Treatment points at R022; R022's Treatment says its own mitigation is incomplete and rests on "only the maintainer's habit". So the chain terminates in a procedural control that R022 explicitly declines to credit. That is not double-counting, and it does not undermine the residual Likelihood above — which rests on the fail-closed detection, not on the habit — but a reader should see that the pair's _combined_ residual has an uncredited joint in the middle. That condition ran from 2026-08-02 until 2026-08-05, when `deploy/main.tf` and `deploy/vars.tf` were committed (`50f1360`) against a verified-empty plan. It was held out of every commit until then by a stated pathspec and nothing else — which is the point: the habit held, and a habit is not a mechanism.

## Monitoring

- **Trigger to re-assess — the original FIRED and is spent.** It read: "a push-tier apply that fails or produces an unintended change (the first such event moves likelihood off Rare immediately), or any edit to the deploy-detection step or its gating expression". Run `31252424980` was that event and the re-rate landed 2026-08-09. Deliberately NOT "a new pipeline hint with this risk_slug" — that fires on scorer activity rather than on the hazard, which is why this register sat uncurated (P083).
- **Replacement trigger, stated because a spent trigger monitors nothing**: a **second** push-tier apply that fails or produces an unintended change through a route other than version resolution (which would move likelihood to 3 and the residual to 15); any edit to the deploy-detection step or its gating expression; or either Treatment option being ratified, which changes the entry rather than re-scoring it.
- **Metrics**: count of push-tier applies and their outcomes. **Canonical count: five** as of 2026-08-09, of which four successful and one failed. The fourth ran against an empty plan, so it exercises the trigger and pipeline rather than the apply; the fifth (`31252424980`) applied and failed, with `RollbackLaunchOnFailure` holding.

## Related

- Criteria: `RISK-POLICY.md`
- Treatment ADRs: **ADR-040** (release-pipeline change-type action matrix) created the axis — note it is still `.proposed.md` — undischarged Confirmation items are P076's subject (R026 retired 2026-08-05); **ADR-001** (risk-gated release process) authorised it in its 2026-07-27 amendment, naming the entry point and its push-tier score.
- Siblings, deliberately NOT consolidated (see P083): **R022** — unstaged `deploy/**` drift reaching this trigger, which is where the exposure was concentrated until that instance was cleared 2026-08-05; the class remains; **R020** — the manual `deploy_only` recovery path, proven only against a no-op plan; **R003** — what an apply does to EB once running, which fires on all three entry points.
- Personas affected: `docs/jtbd/addressr-maintainer/`

## Evidence Log

Auto-populated from `.risk-reports/` via Phase 2b drain.

- 2026-07-27T01:18:00Z: fired in `.risk-reports/2026-07-27T01-18-00-commit.md` (reason: above-appetite-residual)

## Change Log

- 2026-08-09: Re-verified against R028's body change of the same date, which widened the review fence to walk committed history and date an entry at its last change outside its Change Log. **This entry's citation holds** — this entry cites R028 for the same-batch fence behaviour that forced its re-rate into one commit, and widening a check's timestamp source touches no claim about drift or about this entry's subject.

  Recorded because R028's edit was a genuine body move, so the fence correctly required its referrers to be revisited. Under the widened rule this bullet does **not** make this entry a moved target in turn, which is the whole point of the change: before it, exactly this remedy re-armed the check one hop further out, without a fixed point.

- 2026-08-09: **RE-RATED. Likelihood 1 → 2, residual 5 → 10, above appetite; Treatment Accept → Mitigate.** This discharges the re-rate the 2026-08-08 bullet below deferred and P095 tracked as an open task. The trigger that fired was this entry's own: run `31252424980`, a push-tier apply that deployed an unpublished version. Rare is not available against an observed one-in-five, and the reason is sharper than the ratio: Rare rested on an **enumeration of closed accidental-arm routes**, and the event arrived through a route that enumeration did not contain. The P095 fix closes that route and is credited, but a control closing the fifth route cannot restore a claim that rested on there being no sixth.

  **What moved in this batch, since the fence scores dating rather than survival.** The canonical `Metrics` cell (four → five, and no longer "all successful"), the Base rate section and its heading, the Residual Likelihood/Score/Band/appetite lines, the settled 1-versus-2 paragraph, and Treatment. The apply count is mirrored in R020 in four places and those moved in the same commit, because the review fence counts uncommitted files as current and would pass a split batch by construction — the failure mode R028 records against itself.

  **Treatment is named, not applied, and that is deliberate.** Both routes below appetite require a maintainer decision: a plan-visibility gate supersedes what ADR-040 chose, and an explicit above-appetite acceptance is not an agent's to make. Recorded as awaiting ratification rather than left as an omission.

- 2026-08-08: Re-read against the reference-closure fan-out landing in the same change. **This entry's own outbound citations still hold** — the Siblings clause's references to R003, R020 and R022, and the Treatment's pointer to R022, are unaffected by the trigger firing: that changes this entry's likelihood, not what any of them is about. Dated here because the review fence scores _dating_, not whether a citation survives review — an entry whose citations all hold still needs a bullet when the entries it cites move. No cardinal, canonical Metrics cell or score touched.
- 2026-08-08: **The Monitoring re-assess trigger FIRED.** Run `31252424980` was a push-tier apply that failed: it deployed a version that was not published, because `changeset version` had bumped the job's working tree while authoring the release PR and the `deploy/**` disjunct carried no version guarantee. Elastic Beanstalk ran `npm install` for a version that did not exist and failed on both instances; `RollbackLaunchOnFailure` held and production kept serving. Recorded as P095, and the mechanism is fixed — the deployed version now resolves from the registry (ADR-040 amendment 2026-08-08).

  **The Base rate, the Monitoring Metrics cell and the residual are deliberately NOT updated in this bullet.** This entry's own trigger says the first such event "moves likelihood off Rare immediately", which would take the residual from 5 to 10 and above appetite. That re-rate is real work: the apply count is a canonical cell mirrored in three places in this entry, and five other entries reference this one and must be revisited when it changes. Attempting it as a two-line edit alongside the fix was rejected by `risk-register-invariants.test.mjs`, correctly. Tracked as an open task on P095. **Until that re-rate lands, the residual below understates this entry.**

- 2026-07-27: Auto-scaffolded by the Phase 2b drain (ADR-056, plugin-scoped). Pending human curation.
- 2026-08-05: Cross-references to R020 and R022 re-verified after both declared canonical state. Both citations hold, and this entry is the sharpest case for why the declaration was worth building: the Siblings clause below describes R020's path as "proven only against a no-op plan" and R022's instance as cleared with the class standing — and **those are exactly the two values R020 and R022 now declare canonically**. The stale version of that same clause, saying R020's path had "never been exercised", was caught earlier today by the risk scorer reading an inbound reference, not by any sweep. The clause a human had to catch in a second file is now one a machine holds in the first. Recorded per the review-fence check.
- 2026-08-05: Siblings clause corrected — it described R020's `deploy_only` path as "never exercised" after that path was exercised on 2026-08-05. Found by the risk scorer, not by the sweep: this entry was an inbound reference living outside the entry that changed.
- 2026-08-05: Base rate extended to a fourth successful application. The axis fired on `50f1360` to clear R022's four-day `deploy/**` drift — deliberately, against a plan verified empty on four prior runs, and run `31002259787` applied nothing. **Recorded as weaker evidence than the three cutover applies, not as a fourth equivalent point**: an empty plan exercises the trigger and the pipeline, not the apply. The Accept treatment is unchanged.
- 2026-08-04: Curated. Scored 15 inherent / 5 residual, at the appetite line, Treatment **Accept**. The base rate is three successful production applies (`33e6c04`, `96e965c`, `2e557b9`), each verified by reading the `Deploy new version` step's conclusion — evidence the mechanism works, and a small sample against a Severe impact, so likelihood is not driven below Rare on it. 5 is the floor of the Impact-5 column, so the live question was Likelihood 1 versus 2; the risk scorer corrected a draft paragraph that defended "held at 5 rather than below", a choice the matrix does not offer. Rare rests on the closed accidental-arm routes, not on the base rate — three applies test the mechanism, not a bad plan, so against this hazard the sample is zero. Curated as part of the P083 register drain.
