# Problem 039: Decouple SaaS Deployment From npm Publish in Release Pipeline

**Status**: Open
**Reported**: 2026-05-14
**Priority**: 4 (Low) — Impact: Minor (2) × Likelihood: Unlikely (2)
**Origin**: internal
**Effort**: M
**WSJF**: 2.0

## Description

The current release/deploy pipeline couples two distinct concerns into a single flow:

1. **Publishing the npm artifact** (consumed by downstream library users on the public registry).
2. **Deploying the SaaS** to AWS Elastic Beanstalk (consumed by RapidAPI customers).

This coupling causes two problems:

- **Deployment-only changes require a new npm publish.** When the only change is an environment value in prod — e.g. turning `SHADOW` soaking on/off, rotating an env-driven flag, adjusting a runtime toggle that lives in EB env vars — there is no way to roll the change to the SaaS without cutting a new npm release. The published artifact is identical to the prior version, but the registry, changelog, and consumers all see version churn.
- **Changelog conflates two audiences.** The changelog is becoming littered with entries that describe SaaS-only deployment work (env flips, ADR-029 phase transitions, shadow-soak toggles) alongside entries that describe genuine code changes to the published artifact. npm-registry consumers see deployment-internal notes that are irrelevant to them; SaaS-operations history is mixed in with library release notes.

The decoupling needs to preserve the case where a **new software publish** does apply to BOTH surfaces — i.e. when the production deploy happens against a freshly-published artifact, the publish-relevant changelog entries are still correctly attributed to that release. The asymmetry is one-way: every npm publish is followed by a SaaS deploy of that version, but not every SaaS deploy needs a new npm publish.

The best decoupling shape is not yet decided. Options sketched (non-exhaustive, for discussion):

- Separate changelog streams: `CHANGELOG.md` for the published artifact, `DEPLOY-LOG.md` (or similar) for SaaS-only deployment events.
- Changeset typing: extend the `.changeset/` workflow so changesets can be tagged `npm`, `saas`, or `both`; the release pipeline routes them to the appropriate audience.
- Separate version axes: keep the npm semver for the published artifact; introduce a separate deploy-revision counter for SaaS-only events.
- Decouple at the trigger level: a "deploy current latest" workflow that re-runs Terraform / EB env updates without bumping the package version.

Discussion needed to pick a shape; investigation should examine how the current changesets + changelog generation flow interacts with the EB deploy step and what the minimum-change path looks like.

## Symptoms

1. **Forced version churn on infra-only changes.** 20 commits in the recent `deploy/` history carried a `.changeset/*.md` while touching zero files that ship in the published tarball. Each published an npm version whose content differed from its predecessor only in `lib/version.js` and `package.json`. Sample:

   | Commit | Date | Subject |
   | --- | --- | --- |
   | `cabe7d5` | 2026-07-09 | resize v2 parity domain to m6g.large to measure warm latency |
   | `b17952a` | 2026-07-09 | revert v2 domain to t3.small for a longer soak |
   | `35cf2cc` | 2026-07-09 | set v2 steady-state sizing to m6g.large for 2.19 |
   | `db2774d` | 2026-07-13 | re-enable read-shadow to v3 for pre-cutover soak |
   | `8ceb019` | 2026-07-14 | decommission v2 OpenSearch domain (addressr4) |

   Three of these (`cabe7d5`, `b17952a`, `35cf2cc`) are a *single* instance-sizing experiment iterated three times — three public npm versions to resize a search cluster.

2. **Changelog entries addressed to the wrong audience.** `CHANGELOG.md` carries entries such as "Set the v2 OpenSearch domain to the larger instance class… The v2 domain still carries no production traffic" and "Revert the v2 OpenSearch parity domain to the smaller instance class for a longer soak measurement" — statements about SaaS infrastructure that a self-hosting library consumer cannot act on. Several end with a hand-written "Self-hosted deployments are unaffected" disclaimer, which is the symptom acknowledging itself.

3. **Inverse: infra committed but not applied.** An infra commit *without* a changeset never deploys. It sits unapplied on `master` until an unrelated publish carries it out as a rider. `58d7b34` (deploy comment hygiene) is a benign instance. The two events "commit the Terraform" and "apply the Terraform" have no explicit link.

4. **Release-risk contamination.** Every prod deploy is bundled with a registry publish, so the risk assessment of a deploy-only change inherits the blast radius of a public package release, and vice versa. R015 was raised on exactly this basis: a CORS/middleware-ordering release could not be published without also deploying to the live RapidAPI origin.

## Workaround

Write a no-op-ish changeset for the infra change and publish a patch version. This is what all 20 commits above did. It works, costs a public version number per prod change, and pollutes `CHANGELOG.md`.

For a pure EB env-var flip with no repo change at all, there is no workaround short of an out-of-band manual `terraform apply` from a workstation (unreviewed, and outside the deploy path's smoke tests).

## Impact Assessment

- **Who is affected**: primarily the operator (self, during multi-step infra migrations); secondarily npm consumers, who see version churn and irrelevant changelog entries.
- **Frequency**: bursty. Near-zero during steady state; ~20 forced publishes across the ADR-029 / ADR-033 / ADR-035 search-migration window (2026-04 to 2026-07). Any future migration under ADR-029's zero-outage blue/green pattern reproduces the burst.
- **Severity**: Minor. No production outage, no data loss, no consumer breakage — the churned versions are functionally identical. The costs are version-number inflation, changelog noise, contaminated release-risk scoring, and symptom 3's unapplied-infra window.
- **Analytics**: 20 forced publishes out of 61 total published versions in `CHANGELOG.md`; 3 of those 20 were one experiment iterated.

## Root Cause Analysis

### Confirmed mechanism (2026-07-25)

**The gate.** `.github/workflows/release.yml` is the only path that reaches `npm run deploy:prod`. Its three deploy-path steps are each gated on the same condition:

- `Deploy new version` — `if: steps.changesets.outputs.published == 'true'` (release.yml:190)
- `Wait for deployment to stabilize` — same (release.yml:229)
- `Smoke test production` — same (release.yml:233)

`published` is set to `true` only when `changesets/action@v1.9.0` actually publishes to the npm registry. Production deploy is therefore a strict *consequence* of an npm publish, with no other entry point.

**The delivery channel.** The coupling is deeper than the gate. `deploy/deploy.sh` derives everything from `npm_package_version`:

- the generated tfvars set `elasticapp_version = "${npm_package_version}"`;
- the deployment zip is named `mountainpass-addressr-deployment-${npm_package_version}.zip`;
- the generated `deployment/package.json` pins `"@mountainpass/addressr": "${npm_package_version}"`.

So the EB instance installs the running artifact **from the public npm registry**. The deployed artifact's identity *is* an npm version. This is load-bearing and should not be changed casually — it is the ADR-004 / ADR-010 deployment shape.

**Why that does not require a *new* publish.** `deploy/main.tf` names the S3 object (`main.tf:11-12`) and the EB application version (`main.tf:16`) off `var.elasticapp_version`, and the environment's `version_label` off that application version (`main.tf:28`). Re-running the deploy with an *unchanged* version therefore produces no diff on those resources — `aws_s3_object` carries no `etag`/`source_hash`, so Terraform does not inspect the re-zipped bundle's contents. A changed `setting {}` block (the EB env vars at `main.tf:39-116+`) applies as an in-place environment update. And `deploy.sh` already runs `terraform plan -refresh=true -detailed-exitcode` and only applies on exit code 2, so a re-run with genuinely nothing changed is a clean no-op.

**Conclusion: a "deploy the current latest published version" run is already safe and idempotent, with zero change to `deploy.sh` or `main.tf`.** The `workflow_dispatch:` trigger already exists (release.yml:10) and the `release` job already accepts it (`if: github.ref == 'refs/heads/master'`). The *only* thing preventing a publish-free deploy today is the three `published == 'true'` step gates.

### The one-way asymmetry (must be preserved)

**publish ⇒ deploy must stay.** The EB bundle pins the just-published version, so a publish that is not followed by a deploy leaves prod behind the registry. `release.yml:144-187` (the P044 assertion) exists specifically to make a *swallowed* publish loud rather than silently skipping the deploy — and its own comment (release.yml:142-143) states it is designed to "survive a future P039 decouple… independent of what the deploy gates on."

**deploy ⇏ publish is what must become possible.** Any fix therefore adds a **second entry point** to the deploy path. It must not reroute or re-gate the existing publish→deploy path, and must not weaken the P044 assertion on that path.

### Secondary finding: the smoke test is pinned to one steady state

`release.yml:263-267` hard-fails the deploy when `/debug/shadow-config` reports `hostSet != false`, asserting the ADR-035 post-cutover steady state. The Description's motivating use case — "turning `SHADOW` soaking on/off" via an EB env var — would therefore fail its own smoke test. **No option below fixes this**; it is an independent follow-on (parameterise the assertion, or drive it from the Terraform-declared env). Naming it here so the chosen decoupling is not mistaken for a complete solution to the shadow-flip workflow.

### Investigation Tasks

- [ ] Re-rate Priority and Effort at next /wr-itil:review-problems — evidence now supports a higher Likelihood than the pre-investigation guess of Unlikely (2): 20 realised instances. Effort is shape-dependent (S for Option 4, M–L for 1–3). Header fields deliberately left unchanged so `/wr-itil:review-problems` owns the re-rank and the README ranking stays consistent.
- [x] Investigate root cause — audit current release.yml / deploy.yml workflows and how changesets drive npm + EB deploys (2026-07-25; see Confirmed mechanism above. There is no `deploy.yml` — the deploy lives inside `release.yml`'s `release` job.)
- [ ] Discuss decoupling shape with user (changelog stream split vs changeset typing vs separate deploy trigger) — **queued as an outstanding question; Option 4 recommended below.**
- [ ] Create reproduction test / acceptance criteria for "deploy-only" path — draft criteria in Fix Strategy; finalise once the shape is chosen.
- [ ] Follow-on: parameterise the `/debug/shadow-config` smoke assertion so an env-driven shadow flip does not fail its own deploy (secondary finding above).

## Fix Strategy

Four options, costed against this repo. Change surface is per-file; effort is S/M/L.

### Option 1 — Separate changelog streams (`CHANGELOG.md` + `DEPLOY-LOG.md`)

**Change surface**: `.changeset/config.json` (`changelog` key currently `@changesets/cli/changelog`) → a custom changelog module implementing changesets' `getReleaseLine`/`getDependencyReleaseLine`; new `DEPLOY-LOG.md`; probably a `scripts/post-release.d/` hook (that extension point already exists and is invoked by `release-watch.sh:~200`).

**What breaks**: a custom changesets changelog module is a new maintained surface coupled to changesets' internal API. ADR-007's Confirmation criterion pins `.changeset/config.json` — an amendment is required.

**What it does not fix**: nothing about the coupling. A deploy-only change still needs a changeset and still publishes a version. It relabels the noise instead of removing it, and it adds a hand-maintained ledger that duplicates `git log -- deploy/` plus the Actions run history — a second source of truth that will drift.

**Effort**: M. **Verdict**: treats symptom 2 only, and treats it worse than Option 4 does incidentally.

### Option 2 — Changeset typing (`npm` / `saas` / `both`)

**Change surface**: changesets has no type/tag concept, so this is a convention plus custom pipeline logic — a new parse step in `release.yml` placed *before* the changesets action, a routing script, changed gates on all four deploy-path steps, and rework of the P044 assertion.

**What breaks**: several load-bearing invariants at once.
- `changeset version` **deletes** `.changeset/*.md` from the workspace before later steps run — documented in the P044 comment (release.yml:148-153) as the reason an on-disk check false-negatives. The routing decision must be captured into a step output before the action runs.
- The P044 assertion's entire premise is "no pending changesets + `published != 'true'` ⇒ swallowed publish". A `saas`-typed changeset that is consumed without publishing lands exactly in that hole.
- A `saas`-typed changeset would still be version-bumped by `changeset version` unless additionally excluded via `ignore` semantics or deletion — more custom logic.
- `scripts/release-watch.sh` PR detection and `DEPLOY_STATUS` reporting both assume publish ⇔ deploy.
- ADR-007 amendment required.

**Effort**: L. **Verdict**: highest blast radius, and it lands that blast radius on the single pipeline that ships revenue. Not recommended.

### Option 3 — Separate version axes (deploy-revision counter)

**Change surface**: `deploy/deploy.sh` (`elasticapp_version` derivation), `deploy/main.tf:11-12,16` (S3 key and app-version naming), `deploy/vars.tf`, `release.yml`, plus somewhere to store and increment the revision.

**What breaks**: changing the app-version name means **every deploy creates a new EB application version and changes `version_label`**, forcing a full EB application deploy even for an env-var-only change — where today that is an in-place setting update. Operationally worse than the status quo. It also does not remove the publish requirement on its own: the deployment bundle still pins a published npm version, so this must be combined with Option 4 to be useful at all.

**Effort**: L. **Verdict**: solves a version-identity concern nobody has raised, at the cost of more prod churn. Not recommended.

### Option 4 — Publish-free deploy trigger (RECOMMENDED)

**Change surface: `release.yml` only, roughly six lines.**

- `workflow_dispatch:` already exists (release.yml:10) — add a `deploy_only` boolean input under it. No new trigger, no new workflow file.
- Gate the changesets step: `if: inputs.deploy_only != true` (so a deploy-only run never touches the registry).
- Widen the three deploy-path gates from `steps.changesets.outputs.published == 'true'` to `steps.changesets.outputs.published == 'true' || inputs.deploy_only == 'true'` (release.yml:190, 229, 233).
- Add `&& inputs.deploy_only != 'true'` to the P044 assertion (release.yml:154). Without it a deploy-only run reaches the assertion and *passes* (local version equals npm version), but it would be asserting something the run is not doing.

**Unchanged**: `deploy/deploy.sh`, `deploy/main.tf`, `deploy/vars.tf`, `package.json`, `.changeset/**`, `CHANGELOG.md` generation, `scripts/release-watch.sh`. The publish→deploy path is byte-identical, so the one-way asymmetry holds **by construction** rather than by careful re-gating.

**Why it also fixes symptom 2**: once infra-only changes no longer need a changeset, `CHANGELOG.md` stops accreting SaaS-only entries. No `DEPLOY-LOG.md` needed — `git log -- deploy/` plus the Actions run list already is the deploy log, with no drift risk.

**Costs and open risks** (the user should decide with these visible):

1. **ADR-001 risk gate is bypassed.** The release risk gate lives in `.claude/hooks/git-push-gate.sh` and fires on `npm run release:watch`. A `workflow_dispatch` deploy has no equivalent wrapper, so it reaches prod without a risk score. Mitigations: accept it (a manual dispatch is a deliberate human action, and the full smoke-test block still runs and still fails the deploy), or add a thin `npm run deploy:watch` wrapper later that dispatches and watches under the same gate.
2. **Symptom 3 is not fixed.** Infra committed without a changeset still does not auto-apply; someone must remember to dispatch. See variant 4b.
3. **An ADR is required** — an amendment to ADR-001 and/or ADR-010 recording that prod deploy has a second, publish-free trigger and how the risk gate applies to it. Smallest ADR footprint of the four options; ADR-007 is untouched.
4. **The shadow-flip use case additionally needs the secondary finding fixed** (parameterised `/debug/shadow-config` assertion). Independent of the option chosen.

**Effort**: S.

**Variant 4b — auto-dispatch on infra change** (later, not day one): also run the deploy path on push-to-`master` when `deploy/**` changed and no publish happened. Closes symptom 3. Cost: a paths-filter step, and an auto-apply to prod on every infra commit without an explicit human trigger. The existing `concurrency: ${{ github.workflow }}-${{ github.ref }}` group already prevents a concurrent apply against the release path. Effort S–M. Worth revisiting once 4 has been used a few times.

### Recommendation

**Option 4.** It is the only option that touches the actual gate rather than the accounting around it; it is confined to one file; it leaves the publish path, the delivery channel, and the P044 assertion untouched; and it needs the smallest ADR footprint. Options 2 and 3 put the revenue pipeline at risk for no gain Option 4 does not already deliver. Option 1 is worth doing only if the user specifically wants a human-readable prod-change ledger — and then as a `scripts/post-release.d/` hook, not as a custom changesets changelog module.

Explicitly skipped: `DEPLOY-LOG.md` (git history and the Actions run list already cover it).

### Draft acceptance criteria (finalise once shape is chosen)

- Dispatching `release.yml` with `deploy_only=true` on `master` runs `deploy:prod` + smoke tests and publishes nothing; `npm view @mountainpass/addressr version` is unchanged afterwards.
- The same dispatch with no infra change is a clean no-op: `terraform plan -detailed-exitcode` returns 0 and no apply runs.
- An EB env-var-only change in `deploy/main.tf` reaches prod through the dispatch path with no version bump and no `CHANGELOG.md` entry.
- A normal changeset merge still publishes **and** deploys, with the P044 assertion active on that path (regression guard on the asymmetry).

## Dependencies

- **Blocks**: (none)
- **Blocked by**: user decision on the decoupling shape (queued as an outstanding question 2026-07-25).
- **Composes with**: R015 (npm publish coupled to prod deploy) — this ticket is R015's treatment path.

## Related

- `docs/risks/R015-npm-publish-coupled-to-prod-deploy-p039-unresolved.active.md` — standing risk raised from this coupling.
- ADR-001 (risk-gated release process) — the gate a dispatch-triggered deploy bypasses.
- ADR-004 (AWS Elastic Beanstalk deployment) and ADR-010 (devcontainer CI deployment) — the deploy shape; an amendment lands here if Option 4 is chosen.
- ADR-007 (changesets versioning) — untouched by Option 4; would need amendment under Options 1 and 2.
- P044 / RFC-002 — the swallowed-publish assertion, explicitly written to survive this decoupling.
- ADR-029 / ADR-035 — the search-migration windows that generated the 20 forced publishes.
