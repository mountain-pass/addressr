# Risk R015: Every npm publish is a production deployment

**Status**: Active
**Category**: operational (ISO 31000) — release pipeline
**Identified**: 2026-07-24
**Owner**: addressr-maintainer
**Last reviewed**: 2026-08-05
**Next review**: 2027-02-05
**Curation**: curated 2026-08-05 (superseding the auto-scaffolded pending-review state of 2026-07-24), absorbing R019

## Description

There is no way to publish a package version without also deploying to production. `.github/workflows/release.yml:348` gates the **Deploy new version** step on `steps.changesets.outputs.published == 'true' || inputs.deploy_only == true`. **Corrected 2026-08-10** — this previously quoted a third disjunct, `steps.deploy-paths.outputs.changed == 'true'`, which retired with the `deploy/**` push axis, and cited line 358. The correction narrows the quoted gate; it does not weaken this entry, because the retired disjunct was the one path that deployed WITHOUT publishing and so was never part of the coupling this entry names. The first disjunct is the coupling: a changeset merging to master publishes to npm and, in the same job, deploys to Elastic Beanstalk and smoke-tests production.

**The coupling is a decision, not an oversight, and should not be "fixed".** ADR-001's 2026-07-26 amendment states the asymmetry in terms — every publish is followed by a deploy, not every deploy needs a publish — and ADR-040 encodes `published == 'true'` as the first disjunct of the deploy row in a change-type-to-action matrix whose entire purpose was decoupling. It survived that decoupling deliberately. P039 gives the mechanical reason: the generated `deployment/package.json` pins `"@mountainpass/addressr"` at the version `deploy/deploy.sh` resolves, so **the EB instance installs the running artefact from the public npm registry**. _Mechanism corrected 2026-08-08: that version used to come from `npm_package_version`, the job's working tree, which is what P095 broke on; `deploy.sh` now resolves it once via `./resolve-version.sh` and interpolates `${deploy_version}` at every site. **The conclusion is unaffected** — the manifest still pins from the public registry, so `publish ⇒ deploy must stay` holds and this entry's residual does not move._ A publish not followed by a deploy leaves production pointing at a version behind the registry. P039 records `publish ⇒ deploy must stay` as a constraint on any fix.

The standing risk is therefore not the coupling but its consequence: **a change whose intended audience is the npm package alone still cycles production.** A fix that matters only to the self-hosted-operator persona, a types change, a docs-only version bump — each one redeploys the revenue-earning API. The releaser's attention is on the package; the blast radius is the service.

Absorbs **R019** (2026-08-05), which named the graceful-shutdown server-lifecycle rewrite riding this coupling. That was one payload, not a second hazard.

## Inherent Risk

Impact × Likelihood _before_ controls.

- **Impact**: 4 (Significant) — an unintended or unready change reaches the live RapidAPI origin serving paid and free-tier consumers.
- **Likelihood**: 4 (Likely) — the coupling fires on _every_ release, so the exposure is taken every time rather than occasionally.
- **Inherent Score**: 16
- **Inherent Band**: High

## Controls

- **EB health-gated rolling deploy with `RollbackLaunchOnFailure`** — implemented in `deploy/main.tf`. Evidenced: exercised and timed at 6m36s push-to-EB-updated during the ADR-041 rollback drill (commits `43b3309`, `f295bd8`). Note the caveat recorded on R003: `BatchSize = 100 Percentage` cycles the whole fleet, so "Rolling" does not mean a partial-fleet blast radius.
- **`Wait for deployment to stabilize` then `Smoke test production`** — `.github/workflows/release.yml:404,408`, gated on the same condition as the deploy, so a release cannot report green without production answering.

  **Measured false-red rate: 1 in 2** (2026-08-05, runs `30989443618` and `30991052224`). In the failing run `/api-docs` took 9m18s and `/debug/shadow-config` then returned HTTP ≥400 after ~5 minutes of retries, while production probed directly was healthy on all three endpoints in under 300 ms and Terraform had applied nothing. The runner's egress was degraded; the service was not. Because this control runs **after** npm publish and the prod deploy, a false red reports a release that has in fact shipped as failed — and invites a rollback of a good release.

  This is now the **third** face of one control on this entry: it fails **open** for the shadow-config class (below), it gates correctly in the modal case, and it fails **closed spuriously** at an observed 1-in-2. Fix tracked on P039 beside the parameterisation task: retry/backoff plus discriminating runner-egress failure from service failure, so a red smoke means the service is bad rather than the path to it.

- **Changeset-gated releases** — a publish only happens when a changeset exists, so the coupling cannot fire on an arbitrary merge to master.
- **P044 swallowed-publish assertion** — `release.yml:280` fails the run when a publish was expected but did not happen, making a broken publish→deploy loop loud rather than silently green.

## Residual Risk

Impact × Likelihood _after_ controls.

- **Impact**: 4 (Significant) — unchanged. The controls catch a bad deploy after it reaches production; they do not stop it reaching production.
- **Likelihood**: 2 (Unlikely) — the smoke gate plus health-gated rollback means a prod-breaking change is caught and reverted rather than left serving.
- **Residual Score**: 8
- **Residual Band**: Medium
- **Within appetite?**: **No** — appetite is 5 inclusive.

### A named residual the controls do not cover

The production smoke assertion is **hard-coded**, not parameterised: `release.yml:438` asserts `/debug/shadow-config` reports `hostSet != false`. So an env-driven shadow-config flip applies Terraform _first_ and only then fails its own smoke check — leaving production flipped behind a red run, with the deploy already applied and no automatic rollback for the config change. This is P039's open smoke-parameterisation task, and it is the sharpest edge on this entry: the control that makes the residual tolerable is the same control that fails open for one specific change class.

## Treatment

**Mitigate.** Not avoid — the coupling is load-bearing per ADR-001 and ADR-040, and severing it would leave production pointing at a version behind the npm registry.

The residual sits above appetite at 8 and the treatment is P039's smoke-parameterisation task, which closes the named residual above. Until that lands, the operating rule is that **a release is a production deployment and should be scheduled as one** — the same care as a deploy, not the lesser care a package publish invites.

## Monitoring

- **Trigger to re-assess**: a release is proposed whose intended audience is the npm package alone (docs, types, self-hosted-only fix) — that is the case where the coupling is load-bearing and unexamined. Also re-assess when P039's smoke-parameterisation task lands.
- **Metrics**: releases where the deploy was incidental to the intent; smoke-gate failures following a shadow-config change.

## Related

- Criteria: `RISK-POLICY.md`
- Realised-as: [P039](../problems/known-error/039-decouple-saas-deployment-from-npm-publish.md) — Known Error; open for the smoke-parameterisation task, **not** for the coupling itself.
- Absorbs: [R019](R019-release-ships-fresh-server-lifecycle-code-to-prod-via-coupled-publish.retired.md) (retired 2026-08-05)
- Adjacent: [R020](R020-deploy-path-push-tier-prod-deploy-precondition-unmet.active.md) owns the _reverse_ direction — the publish-free `deploy_only` path, built for this problem and first dispatched 2026-08-05, against a plan that changed nothing. R015 owns the coupling; R020 owns the escape hatch, exercised 2026-08-05 against an empty plan only. Deliberately kept separate.
- Treatment ADRs: [ADR 001 amendment 2026-07-26](../decisions/001-risk-gated-release-process.proposed.md) — publish-free `deploy_only` trigger; [ADR 040](../decisions/040-release-pipeline-change-type-action-matrix.proposed.md) — the change-type-to-action matrix that preserved `published ⇒ deploy` deliberately.
- Personas affected: [addressr-maintainer](../jtbd/addressr-maintainer/JTBD-400-ship-releases-reliably-from-trunk.validated.md)

## Evidence Log

Auto-populated from `.risk-reports/` via Phase 2b drain.

- 2026-07-24T14:05:16Z: fired in `.risk-reports/2026-07-24T14-05-16-commit.md` (reason: user-stated-precondition)
- 2026-07-24T14:36:33Z: fired in `.risk-reports/2026-07-24T14-36-33-commit.md` (reason: above-appetite-residual)
- 2026-07-24T14:36:33Z: fired in `.risk-reports/2026-07-24T14-36-33-commit.md` (reason: user-stated-precondition)
- 2026-07-24T23:34:06Z: fired in `.risk-reports/2026-07-24T23-34-06-commit.md` (reason: above-appetite-residual)

## Change Log

- 2026-08-10 (third entry today): **Re-verified after R020 was re-scored against the changesets-armed successor route**, which is now BUILT and is the sole path to a production infrastructure apply — `deploy_only` is deleted. **Directly relevant, and the shape this entry names is now COMPLETE rather than merely surviving.** The entry below noted the push axis was the one entry point that deployed WITHOUT publishing, and that `deploy_only` succeeded it. Both are now gone — and the capability is not lost, it is realised properly: a changeset naming only `apps/addressr-deployment` deploys without publishing AND leaves a committed, reviewable record, which neither predecessor did. The coupling this entry owns concerns what happens when a publish DOES occur and is unaffected. Treatment unchanged: P039's smoke-parameterisation task. No re-rate — residual 8 stands.

- 2026-08-10 (second entry today): **Re-verified after [R020](R020-deploy-path-push-tier-prod-deploy-precondition-unmet.active.md)'s treatment and monitoring were re-pointed** off the `deploy_only` dispatch and onto the changeset-armed release-PR route, per the user-ratified JTBD-400 amendment in commit `09f6418`. **Directly relevant, and it corrects a reading the entry below invites.** That entry noted the push axis was the one entry point that deployed WITHOUT publishing. Phase 4 deletes the second such entry point (`deploy_only`) — but it does not remove the capability, it changes its shape: a changeset targeting only `packages/deployment` deploys without publishing, and does so leaving a committed, reviewable record that neither predecessor did. So the decoupled route survives the substitution and improves in reviewability. The coupling this entry names is unaffected either way, because it concerns what happens when a publish DOES occur. Treatment unchanged: P039's smoke-parameterisation task. No re-rate — the residual of 8 stands.

- 2026-08-10: **Revisited for the `deploy/**` push-axis retirement.** [R021](R021-push-tier-deploy-axis-arms-prod-terraform-apply.retired.md) and [R022](R022-unstaged-terraform-lockfile-drift-arms-deploy-axis.retired.md) retired (hazard deleted, not reduced); [R020](R020-deploy-path-push-tier-prod-deploy-precondition-unmet.active.md) re-scored 8 → 10 because retiring the axis deleted the ground its Impact 4 rested on. Governance: [ADR 001](../decisions/001-risk-gated-release-process.proposed.md) and [ADR 040](../decisions/040-release-pipeline-change-type-action-matrix.proposed.md), 2026-08-10 amendments. **Directly relevant, and this entry gains rather than loses.** Its subject is npm publish being coupled to a prod deploy. Retiring the push axis removes the one entry point that deployed WITHOUT publishing, so the coupling this entry names is now carried by two paths instead of three — but both survivors are deliberate acts, which is a small improvement in reviewability and none at all in coupling. **Its quoted gate string and `release.yml` line references were stale and are corrected in this same commit.** Treatment is unchanged: P039's smoke-parameterisation task. No re-rate — the residual of 8 stands.

- 2026-08-09 (third entry today): Re-verified after the push-tier axis fired again — run `31283258197` applied the `source_hash` hardening itself, taking the canonical apply count to six with five successful. The apply was `0 added, 1 changed, 0 destroyed`, an in-place update of `aws_s3_object.elasticapp` with its id unchanged, so the application version and `version_label` were untouched and the fleet did not cycle. Predicted from the pinned provider's schema before the push and matched exactly.

  **This entry's citation holds** — the count moved, not the ownership, and nothing here restates the cardinal. Recorded because R021 and R020 both took body edits at their count sites, so the fence correctly required their referrers in the same commit. Under the widened fence this bullet does not propagate further.

- 2026-08-09 (second entry today): Re-verified against R021's treatment ratification — preconditions hardened rather than a plan gate added or the residual accepted — and the `source_hash` control that landed with it. **This entry's citation holds**: this entry cites R020 for the reverse direction of the publish/deploy coupling and does not depend on R021's treatment; the R021 token here sits in a dated verification bullet. **R021's residual did not move**: it stays at 10 and above appetite, because Impact is fixed at 5 while nothing on that path reviews the plan.

- 2026-08-09: Re-verified against R021's re-rate and R020's apply-count move to five. **Both citations here hold.** This entry cites R020 for the reverse direction of the coupling and restates R020's canonical `deploy_only` value, which did not move — R020's change was the push-tier apply count, a different fact, and R020's own score is unchanged at 8. R021 is not cited by score here. Also confirming a claim made _about_ this entry elsewhere: P095 listed this entry's `npm_package_version` mechanism sentence as an outstanding falsification, and it is not one — it was corrected in the 2026-08-08 bullet below, in the same batch that recorded the fix. That P095 task text was the stale part, and it is corrected there.

- 2026-08-08: Re-verified after the push-tier deploy-axis entry recorded that its Monitoring re-assess trigger fired (run `31252424980`, a push-tier apply that failed by deploying an unpublished version; mechanism fixed, re-rate tracked on P095) and its reference closure was revisited in the same change. **This entry's citations still hold** — the failure changes that entry's likelihood, not its subject, and it now self-discloses that its residual understates until the re-rate lands. No cardinal here is affected.
- 2026-07-24: Auto-scaffolded by Phase 2b drain (ADR-056). Pending human curation.
- 2026-08-05: Curated under P083. Re-titled from "Npm Publish Coupled To Prod Deploy P039 Unresolved" — the old title framed a decided design as an unresolved defect. Scored 16 inherent / 8 residual, above appetite. Absorbed R019. Recorded the hard-coded smoke assertion as a named uncovered residual.
- 2026-08-05: Cross-references to R003 and R020 re-verified across both moves this sitting. This entry cites R003 for the `BatchSize = 100 Percentage` caveat on its rolling-deploy control, and R020 for the reverse direction of the coupling; R003 gained cross-reference verifications, R020 recorded its treatment partially discharged and then declared canonical state. Neither touches those claims. The R020 citation here restates a figure — "exercised 2026-08-05 against an empty plan only" — which is now R020's declared canonical value, so a future correction there will be enforced rather than relied on to propagate. Recorded per the review-fence check.
