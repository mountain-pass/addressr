# Risk R015: Every npm publish is a production deployment

**Status**: Active
**Category**: operational (ISO 31000) — release pipeline
**Identified**: 2026-07-24
**Owner**: addressr-maintainer
**Last reviewed**: 2026-08-05
**Next review**: 2027-02-05
**Curation**: curated 2026-08-05 (superseding the auto-scaffolded pending-review state of 2026-07-24), absorbing R019

## Description

There is no way to publish a package version without also deploying to production. `.github/workflows/release.yml:358` gates the **Deploy new version** step on `steps.changesets.outputs.published == 'true' || inputs.deploy_only == true || steps.deploy-paths.outputs.changed == 'true'`. The first disjunct is the coupling: a changeset merging to master publishes to npm and, in the same job, deploys to Elastic Beanstalk and smoke-tests production.

**The coupling is a decision, not an oversight, and should not be "fixed".** ADR-001's 2026-07-26 amendment states the asymmetry in terms — every publish is followed by a deploy, not every deploy needs a publish — and ADR-040 encodes `published == 'true'` as the first disjunct of the deploy row in a change-type-to-action matrix whose entire purpose was decoupling. It survived that decoupling deliberately. P039 gives the mechanical reason: `deploy/deploy.sh` derives `elasticapp_version` from `npm_package_version` and the generated `deployment/package.json` pins `"@mountainpass/addressr": "${npm_package_version}"`, so **the EB instance installs the running artefact from the public npm registry**. A publish not followed by a deploy leaves production pointing at a version behind the registry. P039 records `publish ⇒ deploy must stay` as a constraint on any fix.

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
- **`Wait for deployment to stabilize` then `Smoke test production`** — `.github/workflows/release.yml:397,401`, gated on the same condition as the deploy, so a release cannot report green without production answering.

  **Measured false-red rate: 1 in 2** (2026-08-05, runs `30989443618` and `30991052224`). In the failing run `/api-docs` took 9m18s and `/debug/shadow-config` then returned HTTP ≥400 after ~5 minutes of retries, while production probed directly was healthy on all three endpoints in under 300 ms and Terraform had applied nothing. The runner's egress was degraded; the service was not. Because this control runs **after** npm publish and the prod deploy, a false red reports a release that has in fact shipped as failed — and invites a rollback of a good release.

  This is now the **third** face of one control on this entry: it fails **open** for the shadow-config class (below), it gates correctly in the modal case, and it fails **closed spuriously** at an observed 1-in-2. Fix tracked on P039 beside the parameterisation task: retry/backoff plus discriminating runner-egress failure from service failure, so a red smoke means the service is bad rather than the path to it.

- **Changeset-gated releases** — a publish only happens when a changeset exists, so the coupling cannot fire on an arbitrary merge to master.
- **P044 swallowed-publish assertion** — `release.yml:307` fails the run when a publish was expected but did not happen, making a broken publish→deploy loop loud rather than silently green.

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

- 2026-07-24: Auto-scaffolded by Phase 2b drain (ADR-056). Pending human curation.
- 2026-08-05: Curated under P083. Re-titled from "Npm Publish Coupled To Prod Deploy P039 Unresolved" — the old title framed a decided design as an unresolved defect. Scored 16 inherent / 8 residual, above appetite. Absorbed R019. Recorded the hard-coded smoke assertion as a named uncovered residual.
- 2026-08-05: Cross-references to R003 and R020 re-verified across both moves this sitting. This entry cites R003 for the `BatchSize = 100 Percentage` caveat on its rolling-deploy control, and R020 for the reverse direction of the coupling; R003 gained cross-reference verifications, R020 recorded its treatment partially discharged and then declared canonical state. Neither touches those claims. The R020 citation here restates a figure — "exercised 2026-08-05 against an empty plan only" — which is now R020's declared canonical value, so a future correction there will be enforced rather than relied on to propagate. Recorded per the review-fence check.
