# Problem 095: The push-tier deploy axis deploys the unpublished NEXT version while a release PR is open

**Status**: Closed
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

## Fix Strategy

**Option (b) — resolve the version from the registry, not the workspace.** Landed 2026-08-08.

`deploy/resolve-version.sh` resolves once; `deploy/deploy.sh` uses it at all four sites that must agree. On the just-published path `release.yml` sets `ADDRESSR_DEPLOY_JUST_PUBLISHED=1` and the workspace version is used — correct by construction there, and a registry read could return the previous version because `npm view` is a CDN-served read of `latest`. Everywhere else the registry is authoritative, which is what makes the manifest satisfiable. Omitting the signal falls back to the registry, so forgetting it fails safe. Resolution fails closed.

Chosen over (a) because gating on `hasChangesets` would stop the deploy firing at all while a release is pending — losing the infrastructure change until the next release — and closes only this one ordering. Chosen over (c) because asserting registry existence makes the mismatch loud without preventing it; (c)'s value is folded in as the fail-closed check inside the resolver, where it also covers the plan path.

Recorded as an amendment to ADR-040, which also discharges that decision's now-fired reassessment criterion (_"the `deploy/**` axis fires an unintended production deploy"_).

### Investigation Tasks

- [x] Pick the fix. Three candidates, not mutually exclusive:
  - **(a) Gate on the pending-release state.** Require `steps.changesets.outputs.hasChangesets != 'true'` on the `deploy-paths` disjunct, so a `deploy/**` push while a release is pending does not deploy. The deploy is not lost — it rides the release that follows.
  - **(b) Pin the manifest to the published version.** Have `deploy/deploy.sh` resolve the version via `npm view <pkg> version` rather than `npm_package_version`. This makes the axis safe regardless of gate ordering, because the manifest can only ever name something installable.
  - **(c) Assert before applying** that the version being deployed exists on the registry. This does not prevent the mismatch but converts it from an EB instance-level deployment failure into a fast, loud, harmless one.
- [x] Pin it. **Not** in `release-workflow-deploy-only.test.mjs` — option (b) does not touch the gate, so nothing there is invalidated and a shell assertion would be topic drift against that file's stated subject. New `test/js/__tests__/deploy-version-resolution.test.mjs` instead: a fixture test over the extracted resolver with a stub registry, plus a run of `deploy.sh` against stub `terraform`/`zip` that reads what it actually wrote. That is the harness shape the sibling file's own header says shell assertions want. Mutation-proved on both silent-lie shapes.
- [x] Amend ADR-040. The amendment records the rule that was never written down (where `elasticapp_version` comes from), states why the three disjuncts were never equivalent, and discharges the fired reassessment criterion rather than leaving it armed.
- [x] **Register curation — attempted, reverted, then done in full 2026-08-09.** Two entries carried claims this fix falsified: the publish/deploy-coupling entry stated `deploy/deploy.sh` derives `elasticapp_version` from `npm_package_version`, and the push-tier-apply entry's base rate read `four production applies, all successful` while its own Monitoring named that failure as the trigger that "moves likelihood off Rare immediately" — which would take its residual above appetite. Both are corrected; the quotation above is backticked deliberately, because it is a literal of superseded file content and the canonical-count invariant exempts code spans for exactly that reason.

  **Resolved 2026-08-08 by doing the fan-out, after learning it was not optional.** The sequence is worth recording because the cost only became visible at the last step.

  **Even a Change-Log-only bullet does not land on its own.** A dated bullet recording only that the trigger fired — touching no cardinal, no canonical cell, no score — was added, passed locally, and **failed in CI** on the `a referring document is not older than the entry it describes` invariant. The divergence is the check's own mechanism: it compares git mtimes, and a dirty working tree reads as just-touched, so locally every referrer looked current. In CI, where everything is committed, the entry became newer than its five referrers.

  That is worth recording precisely, because it changes the size of this task. The exemption that makes dated Change Log bullets safe applies to the apply-count invariant, not to the referring-document one. So there is no cheap partial correction available at all: any edit to these entries, of any size, requires revisiting all five referrers in the same commit. The register's anti-drift machinery is correct and the cost is real — and it is invisible until CI, which is the part a future attempt should know.

  A two-line correction to the cardinals was also written and reverted, because the same invariants rejected it: the apply count is a canonical cell mirrored in three further places within the push-tier entry alone. That half stays open — it is the re-rate itself, and it needs judgement about where likelihood lands, not just an edit.

  **What did land**: the fired trigger is recorded at the entry's own surface with an explicit "the residual below understates this entry" line, and all five referring entries carry a dated re-verification bullet confirming their citations still hold. The invariant is satisfied because the work it asks for was done, not worked around.

  **Closed 2026-08-09.** The re-rate landed: likelihood moved off Rare, residual 5 → 10 and above appetite, Treatment Accept → Mitigate with the option named and awaiting maintainer ratification. The apply count moved four → five (four successful) at the canonical `Metrics` cell and at every mirrored site — four in the recovery-path entry, several in the push-tier entry itself — plus the register index row, in one commit, because the fence passes a split batch by construction.

  The fan-out is the argument for doing it as a **read** rather than a dating sweep, but only for the part a read actually found. **The above-appetite partition count was machine-forced**: the bolded-partition invariant computes it from the entries' own cells, so it red-built the moment the residual moved, with or without anyone reading. What the read found, and no check reaches, is the provision-phase entry citing this entry's treatment as "Accept" in a treatment-separation argument, and the register-drain ticket's stale score line. Attributing the machine's catch to the read would credit the weaker control with the stronger catch, which is the error the register entry for this class names. The partition moved eleven → twelve, and that entry is the first in this register to cross the appetite line on a realised event rather than on a re-reading.

  **One check had to be widened, and the reason is on-topic.** The canonical-cell invariant extracted the apply count from the phrase `<count>, all successful` — so correcting the cell to record a failure made the extractor find nothing, and the check failed with "must state the canonical apply count" against a cell that stated it plainly. A check whose extractor encodes a fact the register is meant to be free to change is a check that reddens on the truth. The count now sits in an explicit `**Canonical count: <numeral>**` token with the outcome breakdown as ordinary prose beside it.

  The coupling entry's `npm_package_version` claim needed nothing: it was already corrected on 2026-08-08 in the same batch that recorded the mechanism fix. This task's own text asserting otherwise was the stale part.

- [x] **The push-tier deploy-axis register entry needed re-rating. Done 2026-08-09.** Its Monitoring section named its own re-assess trigger as "a push-tier apply that fails or produces an unintended change (the first such event moves likelihood off Rare immediately)". Run 31252424980 was exactly that event. Likelihood moved off Rare to Unlikely, the residual went 5 → 10 and above appetite, and the Treatment changed from Accept to Mitigate. The base rate now records five applies, four of them successful. The trigger itself was spent by firing, so a replacement trigger was written rather than leaving a monitoring line that monitors nothing.
- [x] **`aws_s3_object.elasticapp` now carries a `source_hash`. Done 2026-08-09, on maintainer direction.** It hashes `deployment/package.json`, not the zip: the bundle is built from exactly that one file, whose content is a pure function of the package name and the resolved version, while the zip wrapping it carries mtimes and would diff on every apply. A perpetual false positive is the fastest way to get a real diff ignored. `source_hash` rather than `etag` because terraform compares `etag` against the object's real S3 ETag, so any value that is not the MD5 of the uploaded zip diffs forever; `source_hash` is compared against state, which is what makes hashing the input possible at all.

  **Three gaps the hash alone left, all closed in the same commit.** `deploy.sh` never cleaned `deployment/`, and `zip` UPDATES an existing archive rather than replacing it, so on an operator machine stale contents could ride along invisibly. And `zip`'s exit status was unchecked in a `#!/bin/sh` script with no `set -e`, so a failed build beside a stale archive would have uploaded stale bytes under a fresh, correct-looking hash — the one route where content-awareness made things worse. The bundle directory is now rebuilt from empty, the target archive removed first, and both `zip` and the `cd` fail closed.

  **The premise is pinned, not assumed.** `deploy-version-resolution.test.mjs` asserts the bundle contains exactly `package.json` at zip time, so adding a `Procfile` or an `.ebextensions/` fragment fails loudly rather than silently escaping coverage while `main.tf` goes on claiming it. Mutation-proved against a surviving stale file and against an added second file.

  **What it still does not prove**, stated because the hash is a proxy: it detects that the INPUT changed, never that the uploaded artefact was built from that input. The workflow header that used to carry the blindness caveat now says exactly that instead of claiming coverage it does not have.

## Fix Released

**Released**: 2026-08-08 — `09ab4dbc` (`fix(deploy): resolve the deployed version from the registry, not the workspace`) reached production at 13:12 via run `31259020914`, the publish-triggered deploy on the release-PR merge `77fa7c72`. **Not by its own push**: that push's run (`31256089801`) failed at the test stage and the `release` job was skipped, so it deployed nothing. `deploy/**` is not in the published npm package, so a master push is the release vehicle when the deploy runs — here it was the next apply from any entry point that carried the commit. <!-- no-changeset-reference -->

**Second half released**: 2026-08-09 — master push of `3b330147` (`fix(deploy): make terraform content-aware about the deployment bundle`), applied by run `31283258197`. Apply was `0 added, 1 changed, 0 destroyed`, an in-place update of `aws_s3_object.elasticapp` with its id unchanged, so the application version and `version_label` were untouched and the fleet did not cycle.

Fix, in two parts, because the ticket named two preconditions the push-tier disjunct never checked:

1. **The version is published.** `deploy/resolve-version.sh` resolves from the registry's `latest` dist-tag on the non-publish paths and fails closed on an error or empty read; the publish path keeps the workspace version, which is correct by construction and avoids a stale CDN read. All four consumers — tfvar, manifest version, dependency pin, zip name — take the one resolved value.
2. **The bundle matches the version in its name.** `aws_s3_object.elasticapp` carries `source_hash` over the deployment manifest, so a disagreeing bundle produces a plan diff instead of silence. `deploy.sh` rebuilds the bundle directory from empty and fails closed if `zip` fails, closing the operator-machine route where a stale archive would ship under a fresh, correct-looking hash.

**Awaiting user verification** — the thing to watch is the case this ticket was filed for: push a `deploy/**` change while a release PR is open, and confirm the deploy pins the CURRENTLY PUBLISHED version rather than the bumped working-tree one. That combination has not recurred since the fix; both post-fix applies ran with the workspace and registry versions already in agreement, so the discriminating path is covered by tests and not yet by an exercise.

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

- [P039](../closed/039-decouple-saas-deployment-from-npm-publish.md) — decoupling SaaS deployment from npm publish. This is a defect in the wiring that ticket's fix delivered, not unfinished work belonging to it: P039's recorded residual on this axis is a **governance-tier** concern (push-tier reaches production), whereas this is **version skew**. Raising the tier would not have prevented it, and gating on pending releases does not change the tier.
- [P094](094-published-package-with-geo-enabled-is-tested-by-nothing.md) — both are gaps between what CI exercises and what production actually runs.
- [ADR-040](../../decisions/040-release-pipeline-change-type-action-matrix.proposed.md) — authored the three-disjunct deploy gate and the `deploy/**` axis.
- [ADR-044](../../decisions/044-native-esm-without-a-build-step.proposed.md) — its deferred dead-code deletion was the `deploy/**` push that surfaced this.
- [ADR-001](../../decisions/001-risk-gated-release-process.proposed.md) — its 2026-07-27 amendment admits the push-tier `deploy/**` entry point; this incident is evidence for the next re-ratification of that amendment.

## Closed — verified

**Verified in production 2026-08-09, on the exact case this ticket was filed for.**

The discriminating scenario is a `deploy/**` push landing while a release PR is open. That occurred: run `31283258197` ran at 23:07 on 2026-08-08, and release PR #515 was open from 15:25 until 23:59. In that same job `changesets/action` ran, bumping the workspace to 3.1.1 to author the PR — which is the precise condition that broke it the first time.

The deploy resolved **3.1.0**, the version published on npm at that moment, not the bumped workspace version. Evidence from the run: the S3 object id is `mountainpass-addressr-deployment-3.1.0.zip`, and the post-deploy smoke returned `{"status":"healthy","version":"3.1.0"}`.

Before the fix this deployed 3.1.1, which did not exist on the registry, and Elastic Beanstalk failed `npm install` on both instances — run `31252424980`, 2026-08-08 at 10:16.

Verified by the agent from run logs rather than left to the maintainer, per direction 2026-08-09.
