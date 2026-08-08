# Problem 095: The push-tier deploy axis deploys the unpublished NEXT version while a release PR is open

**Status**: Open
**Reported**: 2026-08-08
**Priority**: 12 (High) — Impact: Significant (4) × Likelihood: Possible (3). Impact 4: a failed deployment against the live origin plus recoverable Terraform state drift. Not 5 — `RollbackLaunchOnFailure` held and production never stopped serving. Likelihood 3: fires whenever a `deploy/**` push coincides with a pending changeset, which is a normal combination.
**Origin**: internal — realised in production, run 31252424980
**Effort**: S — a gate condition, not a redesign
**WSJF**: 12.0 — (12 × 1.0) / 1
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

`changesets/action` runs `npm run turbo:ci:version` → `changeset version` inside the `release` job to author the release PR. That **bumps `package.json` in the job's working tree** to the next version. The `Deploy new version` step runs later in the **same job** and reads `npm_package_version`, so it deploys the version that was just written into the workspace and has not been published to npm.

`deploy/deploy.sh` writes a deployment manifest pinning the package from the public registry:

```json
"dependencies": { "@mountainpass/addressr": "${npm_package_version}" }
```

so Elastic Beanstalk runs `npm install` for a version that does not exist, and the deployment fails.

## Symptoms

Run [31252424980](https://github.com/mountain-pass/addressr/actions/runs/31252424980), 2026-08-08. Terraform planned:

```
version_label = "mountainpass-addressr-v3.0.8" -> "mountainpass-addressr-v3.1.0"
key           = "...-deployment-3.0.8.zip"     -> "...-deployment-3.1.0.zip" # forces replacement
```

then, from Elastic Beanstalk:

```
Instance deployment: 'npm' failed to install dependencies that you defined in
'package.json'. For details, see 'eb-engine.log'. The deployment failed.
[Instance: i-015412023f96b9557,i-0628bb347f04af458] Command failed on instance.
```

`npm view @mountainpass/addressr versions` ends at `3.0.8`. 3.1.0 existed only in the job's workspace.

**Production was not affected.** `RollbackLaunchOnFailure = true` held. Five probes of `/health` immediately afterwards returned 200 with `"version":"3.0.8","status":"healthy"`; `/api-docs` returned 200.

## Root Cause Analysis

**The deploy gate's three disjuncts are not equally safe.**

```
success() && (steps.changesets.outputs.published == 'true'
           || inputs.deploy_only == true
           || steps.deploy-paths.outputs.changed == 'true')
```

The first two carry a version guarantee by construction. `published == 'true'` means the publish just happened, so the workspace version **is** the registry version. `deploy_only` is a deliberate dispatch of the current published version.

The third carries none. `deploy-paths.changed` fires on a `deploy/**` push and says nothing about the version. If a changeset is pending, `changeset version` has already moved the workspace forward, and the deploy takes that.

Ordinarily invisible: a `deploy/**` push and a pending changeset rarely coincide, because infrastructure changes usually land alone. This instance was a `deploy/**`-only commit deliberately pushed by itself — the dead-code deletion [ADR-044](../../decisions/044-native-esm-without-a-build-step.proposed.md) held back precisely so the production apply it arms would be the deliberate act the axis exists to serve — while the ESM migration's release PR sat open. **The sequencing the risk gate recommended is what surfaced the defect.**

### Terraform state drift, and why it is benign

The apply got partway: the S3 object and application version for 3.1.0 were created before the environment update failed. A plan from master afterwards ([run 31252727573](https://github.com/mountain-pass/addressr/actions/runs/31252727573)) wants to reverse them:

| resource                                               | actions        |
| ------------------------------------------------------ | -------------- |
| `aws_elastic_beanstalk_application_version.elasticapp` | create, delete |
| `aws_s3_object.elasticapp`                             | create, delete |

That reversal targets **3.0.8**, which IS published, so the next `deploy/**` push or `deploy_only` dispatch applies it successfully rather than failing again. Merging the release PR resolves it forwards instead, by making 3.1.0 real. Either direction converges; neither leaves production wrong.

### An adjacent property, unrecorded until now

`aws_s3_object.elasticapp` in `deploy/main.tf` declares `bucket`, `key` and `source` — and **no `etag` and no `source_hash`**. Terraform therefore tracks that object by key alone, never by content.

Two consequences, and they cut in opposite directions:

- **Here it helps.** Merging the release PR is the _smaller_ apply, not the larger one. State already holds the 3.1.0 S3 object and application version from the failed run, so at 3.1.0 both render identically and only `version_label` changes — one resource. The master-at-3.0.8 reversal wants create-and-delete on two. And the zip Terraform will not re-upload is the one the failed run uploaded, whose manifest pins `3.1.0` — which publishing 3.1.0 makes correct.
- **In general it is a hazard.** A deployment zip whose _contents_ change without the version changing is silently stale: Terraform sees no diff and deploys the old artefact. Nothing currently records this. It is inert today because the zip's content is a pure function of the version, but that is a property nothing enforces.

### Investigation Tasks

- [ ] Pick the fix. Three candidates, not mutually exclusive:
  - **(a) Gate on the pending-release state.** Require `steps.changesets.outputs.hasChangesets != 'true'` on the `deploy-paths` disjunct, so a `deploy/**` push while a release is pending does not deploy. The deploy is not lost — it rides the release that follows.
  - **(b) Pin the manifest to the published version.** Have `deploy/deploy.sh` resolve the version via `npm view <pkg> version` rather than `npm_package_version`. This makes the axis safe regardless of gate ordering, because the manifest can only ever name something installable.
  - **(c) Assert before applying** that the version being deployed exists on the registry. This does not prevent the mismatch but converts it from an EB instance-level deployment failure into a fast, loud, harmless one.
- [ ] Pin whichever lands in `test/js/__tests__/release-workflow-deploy-only.test.mjs`. That file already parses `release.yml` and asserts the gate expression exactly, including an occurrence count of 3 — so a change to the deploy-paths disjunct changes pinned assertions there by construction.
- [ ] Amend ADR-040, which authored this gate. Fix option (a) narrows its deploy-paths row, so the fix carries an amendment obligation rather than a supersession (ADR-040 is `proposed`).
- [ ] Record the incident against the risk register entry for publish/deploy coupling: the partial treatment introduced a new exposure, which belongs on that entry's control-credit line.
- [ ] **The push-tier deploy-axis register entry is now stale and needs re-rating.** Its Monitoring section names its own re-assess trigger as "a push-tier apply that fails or produces an unintended change (the first such event moves likelihood off Rare immediately)". Run 31252424980 is exactly that event, and its Base rate still reads "four production applies, all successful" — now five, one failed. If likelihood moves off Rare as that entry instructs, its residual goes from 5 to 10 and above appetite.
- [ ] Consider whether `aws_s3_object.elasticapp` should carry an `etag`/`source_hash`, per the adjacent property above.

## Workaround

Do not push a `deploy/**` change while a release PR is open. Merge the release first, or hold the `deploy/**` commit until after.

## Impact Assessment

- **Who is affected**: the maintainer, and the deployment pipeline. No consumer impact in the realised instance.
- **Frequency**: whenever a `deploy/**` push coincides with a pending changeset.
- **Severity**: Significant. The realised outcome was a failed deployment and recoverable state drift, but the same gate deploys an unpublished version any time the two coincide, and the failure lands as an instance-level `npm install` failure against the live environment.
- **Analytics**: run 31252424980 (the failure), run 31252727573 (the post-failure plan showing the drift).

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: P039, P094

## Related

- [P039](../known-error/039-decouple-saas-deployment-from-npm-publish.md) — decoupling SaaS deployment from npm publish. This is a defect in the wiring that ticket's fix delivered, not unfinished work belonging to it: P039's recorded residual on this axis is a **governance-tier** concern (push-tier reaches production), whereas this is **version skew**. Raising the tier would not have prevented it, and gating on pending releases does not change the tier.
- [P094](094-published-package-with-geo-enabled-is-tested-by-nothing.md) — both are gaps between what CI exercises and what production actually runs.
- [ADR-040](../../decisions/040-release-pipeline-change-type-action-matrix.proposed.md) — authored the three-disjunct deploy gate and the `deploy/**` axis.
- [ADR-044](../../decisions/044-native-esm-without-a-build-step.proposed.md) — its deferred dead-code deletion was the `deploy/**` push that surfaced this.
- [ADR-001](../../decisions/001-risk-gated-release-process.proposed.md) — its 2026-07-27 amendment admits the push-tier `deploy/**` entry point; this incident is evidence for the next re-ratification of that amendment.
