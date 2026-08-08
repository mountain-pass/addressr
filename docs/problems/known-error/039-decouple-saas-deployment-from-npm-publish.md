# Problem 039: Decouple SaaS Deployment From npm Publish in Release Pipeline

**Status**: Known Error
**Reported**: 2026-05-14
**Priority**: 4 (Low) — Impact: Minor (2) × Likelihood: Unlikely (2)
**Origin**: internal
**Effort**: M
**WSJF**: 4.0

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

   | Commit    | Date       | Subject                                                      |
   | --------- | ---------- | ------------------------------------------------------------ |
   | `cabe7d5` | 2026-07-09 | resize v2 parity domain to m6g.large to measure warm latency |
   | `b17952a` | 2026-07-09 | revert v2 domain to t3.small for a longer soak               |
   | `35cf2cc` | 2026-07-09 | set v2 steady-state sizing to m6g.large for 2.19             |
   | `db2774d` | 2026-07-13 | re-enable read-shadow to v3 for pre-cutover soak             |
   | `8ceb019` | 2026-07-14 | decommission v2 OpenSearch domain (addressr4)                |

   Three of these (`cabe7d5`, `b17952a`, `35cf2cc`) are a _single_ instance-sizing experiment iterated three times — three public npm versions to resize a search cluster.

2. **Changelog entries addressed to the wrong audience.** `CHANGELOG.md` carries entries such as "Set the v2 OpenSearch domain to the larger instance class… The v2 domain still carries no production traffic" and "Revert the v2 OpenSearch parity domain to the smaller instance class for a longer soak measurement" — statements about SaaS infrastructure that a self-hosting library consumer cannot act on. Several end with a hand-written "Self-hosted deployments are unaffected" disclaimer, which is the symptom acknowledging itself.

3. **Inverse: infra committed but not applied.** An infra commit _without_ a changeset never deploys. It sits unapplied on `master` until an unrelated publish carries it out as a rider. `58d7b34` (deploy comment hygiene) is a benign instance. The two events "commit the Terraform" and "apply the Terraform" have no explicit link.

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

`published` is set to `true` only when `changesets/action@v1.9.0` actually publishes to the npm registry. Production deploy is therefore a strict _consequence_ of an npm publish, with no other entry point.

**The delivery channel.** The coupling is deeper than the gate. `deploy/deploy.sh` derives everything from `npm_package_version`:

- the generated tfvars set `elasticapp_version = "${npm_package_version}"`;
- the deployment zip is named `mountainpass-addressr-deployment-${npm_package_version}.zip`;
- the generated `deployment/package.json` pins `"@mountainpass/addressr": "${npm_package_version}"`.

So the EB instance installs the running artifact **from the public npm registry**. The deployed artifact's identity _is_ an npm version. This is load-bearing and should not be changed casually — it is the ADR-004 / ADR-010 deployment shape.

**Why that does not require a _new_ publish.** `deploy/main.tf` names the S3 object (`main.tf:11-12`) and the EB application version (`main.tf:16`) off `var.elasticapp_version`, and the environment's `version_label` off that application version (`main.tf:28`). Re-running the deploy with an _unchanged_ version therefore produces no diff on those resources — `aws_s3_object` carries no `etag`/`source_hash`, so Terraform does not inspect the re-zipped bundle's contents. A changed `setting {}` block (the EB env vars at `main.tf:39-116+`) applies as an in-place environment update. And `deploy.sh` already runs `terraform plan -refresh=true -detailed-exitcode` and only applies on exit code 2, so a re-run with genuinely nothing changed is a clean no-op.

**Conclusion: a "deploy the current latest published version" run is already safe and idempotent, with zero change to `deploy.sh` or `main.tf`.** The `workflow_dispatch:` trigger already exists (release.yml:10) and the `release` job already accepts it (`if: github.ref == 'refs/heads/master'`). The _only_ thing preventing a publish-free deploy today is the three `published == 'true'` step gates.

### The one-way asymmetry (must be preserved)

**publish ⇒ deploy must stay.** The EB bundle pins the just-published version, so a publish that is not followed by a deploy leaves prod behind the registry. `release.yml:144-187` (the P044 assertion) exists specifically to make a _swallowed_ publish loud rather than silently skipping the deploy — and its own comment (release.yml:142-143) states it is designed to "survive a future P039 decouple… independent of what the deploy gates on."

**deploy ⇏ publish is what must become possible.** Any fix therefore adds a **second entry point** to the deploy path. It must not reroute or re-gate the existing publish→deploy path, and must not weaken the P044 assertion on that path.

### Secondary finding: the smoke test is pinned to one steady state

`release.yml:263-267` hard-fails the deploy when `/debug/shadow-config` reports `hostSet != false`, asserting the ADR-035 post-cutover steady state. The Description's motivating use case — "turning `SHADOW` soaking on/off" via an EB env var — would therefore fail its own smoke test. **No option below fixes this**; it is an independent follow-on (parameterise the assertion, or drive it from the Terraform-declared env). Naming it here so the chosen decoupling is not mistaken for a complete solution to the shadow-flip workflow.

### Investigation Tasks

- [ ] Follow-on, same control: the `deploy/**` disjunct this ticket's fix introduced deploys the workspace version, which `changeset version` has already bumped when a release PR is open — so a `deploy/**` push while a release is pending deploys a version that is not on npm. Realised in production 2026-08-08, run 31252424980. See [P095](../open/095-deploy-axis-deploys-the-unpublished-next-version-while-a-release-pr-is-open.md).

- [ ] Re-rate Priority and Effort at next /wr-itil:review-problems — evidence now supports a higher Likelihood than the pre-investigation guess of Unlikely (2): 20 realised instances. Effort is shape-dependent (S for Option 4, M–L for 1–3). Header fields deliberately left unchanged so `/wr-itil:review-problems` owns the re-rank and the README ranking stays consistent.
- [x] Investigate root cause — audit current release.yml / deploy.yml workflows and how changesets drive npm + EB deploys (2026-07-25; see Confirmed mechanism above. There is no `deploy.yml` — the deploy lives inside `release.yml`'s `release` job.)
- [x] Discuss decoupling shape with user (changelog stream split vs changeset typing vs separate deploy trigger) — **Option 4 + Option B approved 2026-07-26; implemented, see Fix Strategy.**
- [x] Create reproduction test / acceptance criteria for "deploy-only" path — `test/js/__tests__/release-workflow-deploy-only.test.mjs` pins the predicates (2026-07-26). Acceptance criteria below stand; they need a real dispatch to exercise.
- [ ] **Verification dispatch** — run `npm run release:watch -- --deploy-only` against the acceptance criteria below, then transition Known Error → Verifying → Closed. Not doable from CI-on-push: a push-triggered run never sets `deploy_only`.
- [ ] Follow-on: parameterise the `/debug/shadow-config` smoke assertion so an env-driven shadow flip does not fail its own deploy (secondary finding above). Serves JTBD-201. **Blocks the shadow-flip use case; P039 does not close without it.**
- [ ] Follow-on, same control, opposite direction: **the production smoke gate returns false reds on a healthy service.** Measured 1-in-2 on 2026-08-05 (runs `30989443618` and `30991052224`) while exercising the `deploy_only` path. In the failing run `/api-docs` took 9m18s and `/debug/shadow-config` returned HTTP ≥400 after ~5 min of retries; Terraform had applied nothing and production probed directly was healthy on all three endpoints in under 300 ms. Degraded runner egress, not a degraded service. Because this gate runs **after** npm publish and the prod deploy, a false red reports a shipped release as failed and invites the rollback of a good release — and mid-incident it makes a successful `deploy_only` recovery indistinguishable from a failed one. Fix: retry/backoff, plus discriminate runner-egress failure from service failure so a red smoke means the service is bad rather than the path to it. Carried as a risk on R015's `Smoke test production` control credit.
- [x] Separate ticket: ADR 004's Decision Outcome and Consequences still say `AllAtOnce`, but `deploy/main.tf:253-254` is `DeploymentPolicy = "Rolling"`. Doc-vs-infra drift found during this work; deliberately not fixed here (amending a confirmed ADR is its own governance act). — **Discharged 2026-07-26** by the ADR 004 Amendment 2026-07-26 (doc-only; no infra change). The amendment also found that the drift ran deeper than "AllAtOnce vs Rolling": the deploy is `Rolling` at `BatchSize = 100 Percentage`, so it batches the whole fleet at once and the "health-based batching" phrasing used here and in ADR 001 conflated the `aws:elasticbeanstalk:command` deploy path with the `aws:autoscaling:updatepolicy:rollingupdate` ASG-replacement path. ADR 001's amendment note was corrected in the same commit. Two follow-ups are recorded in ADR 004's Reassessment Criteria, not here: lowering `BatchSize`, and verifying which batching path an EB env-var-only update travels (ADR 029's zero-outage claims at lines 85 / 104 / 152 depend on it).

## Fix Strategy

### IMPLEMENTED 2026-07-26 — Option 4 + Option B risk-gating (Known Error)

User-approved after a full wr-architect review (four rounds; PASS on round 4) and wr-jtbd review (PASS). Shipped shape:

**1. `.github/workflows/release.yml` — single-definition `if:`-widening.** No second job, no duplicated deploy steps. Four predicates:

| Location                                      | Predicate                                                                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `workflow_dispatch.inputs.deploy_only`        | `type: boolean`, `default: false`                                                                                                    |
| `release` job guard (unchanged, load-bearing) | `if: github.ref == 'refs/heads/master'`                                                                                              |
| changesets/publish step                       | `if: inputs.deploy_only != true`                                                                                                     |
| P044 assertion                                | `if: steps.changesets.outputs.published != 'true' && steps.changesets.outputs.hasChangesets != 'true' && inputs.deploy_only != true` |
| Deploy / Wait / Smoke (×3)                    | `if: success() && (steps.changesets.outputs.published == 'true' \|\| inputs.deploy_only == true)`                                    |

**Correction to the Option 4 sketch below: the boolean form is mandatory; the string form was wrong.** Lines in "Option 4" originally specified `inputs.deploy_only == 'true'` / `!= 'true'`. Because the input is declared `type: boolean` and the `inputs` context _preserves_ the declared type (only `github.event.inputs.*` is always-string), GitHub coerces mismatched operands to number — so `true == 'true'` evaluates `1 == NaN` → **false**. The deploy gates would never fire on a deploy-only dispatch: the run would go **green with the Deploy step skipped** and the fix would ship inert. Corrected in the Option 4 text below.

`success() && (...)` is explicit rather than implicit because `deploy_only` is a constant on the dispatch path carrying no upstream dependency. The parentheses are load-bearing — `&&` binds tighter than `||`, so `success() && A || B` would deploy after an upstream failure.

**2. Risk gate (Option B).** The gated entry point is `npm run release:watch -- --deploy-only` — a flag on `scripts/release-watch.sh`, not a separate script. The wr-risk-scorer gate matches on the `npm run release:watch` command _prefix_, so the flagged form is gated **by construction** at release tier. A `npm run deploy:watch` alias would be ungated (npm spawns the inner command in a child shell the hook never sees), so `deploy:watch` ships as a fail-closed signpost that prints the correct command and exits 1. Note the gate is **plugin-owned** (wr-risk-scorer), not the repo-local `.claude/hooks/git-push-gate.sh` named at line 158 below and in both wrapper scripts — that directory does not exist; corrected in this commit.

The `--deploy-only` branch skips PR discovery, the gated-run approval, the CI check, the merge, and the post-release hooks; adds `--event workflow_dispatch` to run discovery (two entry points now produce runs on master); and **exits non-zero when the Deploy step concludes anything but `success`** — a skipped deploy on a deploy-only run is the exact symptom of a mis-typed predicate, which otherwise presents as a fully green run.

**3. Regression guard.** `test/js/__tests__/release-workflow-deploy-only.test.mjs` (runs under the existing `npm run test:js`, already in the pre-commit chain) pins all four predicates as exact strings, asserts the deploy gate appears exactly 3×, and fails if anyone re-quotes `deploy_only` against `'true'`.

**4. Governance.** ADR 001 amended (new publish-free trigger, the single-definition anti-divergence constraint, the prefix-match gating mechanism, the corrected gate location, the accepted raw-`gh workflow run` residual, ADR 004's Rolling/health-batched disruption inheritance, the ADR 007 one-run release-PR deferral, and the scope limitation below); two new Confirmation criteria and one new Reassessment criterion; compendium regenerated. R015 links this as a **partial** treatment. JTBD-400 gains the infra-only-deploy job story, matching desired outcome, and the two wrapper scripts in `screens:`.

**Architect conditions carried:** ADR 004's own text still claims `AllAtOnce` while `deploy/main.tf:253-254` is `Rolling` — that drift is queued as a separate ticket, deliberately not fixed here. — **Discharged 2026-07-26** by the ADR 004 Amendment 2026-07-26; see the corresponding Investigation Task above.

### Deferred, NOT delivered — smoke-test parameterisation

The smoke block hard-asserts `hostSet != false` (`release.yml:263-267`) and runs _after_ the deploy (`189`) and the wait (`228-230`). A deploy-only dispatch that flips the shadow config therefore **applies the Terraform first** and only then fails the assertion — prod is left flipped behind a red run with no automatic rollback (`RollbackLaunchOnFailure` at `deploy/main.tf:513-514` covers EB launch failure, not a red smoke test). The Description's motivating use case (toggling `SHADOW` soaking via an EB env var) is therefore still not deliverable through this path. Parameterising the assertion is an independent decision — where does the expected value live: a dispatch input, a repo variable, or a Terraform output? — and is scoped beyond this change. It is the open investigation task below and serves JTBD-201.

### Variant 4b lifted 2026-07-26 — PREREQUISITE before it is wired

The user lifted the deferral on variant 4b (also run the deploy path on push-to-`master` when
`deploy/**` changed and no publish happened) on 2026-07-26, recorded in
[ADR-040](../../decisions/040-release-pipeline-change-type-action-matrix.proposed.md). The "worth
revisiting once 4 has been used a few times" precondition below was **not** met — `--deploy-only` has
been dispatched zero times. ADR-040 records that plainly rather than working around it.

**Do not wire the `deploy/**` trigger until [ADR-001](../../decisions/001-risk-gated-release-process.proposed.md)
is amended.** The two existing deploy entry points carry a release-tier risk score, because the
wr-risk-scorer gate matches on the `npm run release:watch` command prefix. A `deploy/**` path push
carries only push-tier: the git-push gate sees `git push`, not `release:watch`. So the new axis would
reach a full production Terraform apply at a lower governance tier than either existing entry point,
with no human intent and no opt-in — a different class from the deliberate raw dispatch ADR-001's
accepted residual covers.

ADR-001 is not amended yet because an amendment has to describe the trigger as actually implemented,
and no trigger exists. The amendment lands with the wiring, in the same commit as the widened gate
and the `release-workflow-deploy-only.test.mjs` update. This note is here so the prerequisite is
reachable from the P039 side without editing ADR-001 ahead of the fact.

#### PREREQUISITE DISCHARGED 2026-07-27 — and one obligation it does NOT discharge

ADR-001 now carries an `Amendment 2026-07-27` block naming the `deploy/**` entry point and its
push-tier score, and the `deploy/**` axis is wired. The prerequisite above is met, and it is enforced
mechanically rather than by grep: `release-workflow-deploy-only.test.mjs` cross-reads ADR-001 and
asserts the co-occurrence of `deploy/**` and `push-tier` (keyed on those, deliberately not on the
amendment heading, because ADR-001 already carried an unrelated 2026-07-26 amendment block that would
have made a heading-keyed assertion pass vacuously). ADR-001's `human-oversight: confirmed` marker is
**preserved, not flipped**, per the ADR-004 precedent, with re-ratification queued to
`/wr-architect:review-decisions`.

**One narrowing to note:** `deploy/.terraform.lock.hcl` is excluded from the detection pathspec. A
provider-lock bump carries no infra intent of its own and is the likeliest file to be swept
incidentally into an unrelated push; a deliberate provider upgrade goes through the `deploy_only`
dispatch, which is gated at release tier. The exclusion announces itself with a `::notice::` so it is
never a silent no-deploy. See ADR-040's 2026-07-27 stage-3 amendment, point 6.

**What this does NOT discharge — JTBD-400 is now CONTRADICTED, not stale.** This ticket authored
JTBD-400's infra-only-deploy job story, and it is this ticket's own variant 4b that stage 3 wires. So
the contradiction is mirrored here rather than left only on P055 and the ADR. Through stage 2,
JTBD-400's Desired Outcome — "the dispatch remains operator-initiated by design; the compensating
control is that it is the one gated path, and auto-dispatch on infra change (P039 variant 4b) is
deliberately deferred until the manual path has been exercised" — was merely **incomplete**, because
no auto-deploy trigger existed. Stage 3 is the commit that makes it **false**, on every clause: the
dispatch is no longer the only path; "it is the one gated path" is no longer a compensating control
that exists; and the deferral was lifted with the manual path dispatched zero times. The ADR-001
amendment discharges ADR-040's own prerequisite; it does **not** discharge this. JTBD-400 is
`human-oversight: confirmed` and the wiring run was AFK, so amending it batches into
`/wr-jtbd:confirm-jobs-and-personas` alongside the `screens:` omissions already tracked on P055.

### Verification status

The `deploy_only` branch **cannot be fully verified without a real `workflow_dispatch`**. CI on push validates only that the YAML parses and that the normal published-gate path is unaffected — a push-triggered run never sets `deploy_only`, so the widened branch is not exercised. Hence Known Error, not Verifying. Verification is a deliberate deploy-only dispatch (ideally with no pending infra change, so `terraform plan -detailed-exitcode` returns 0 and the run is a clean no-op) against the draft acceptance criteria below. Not triggered as part of this commit.

### Options as originally costed

Four options, costed against this repo. Change surface is per-file; effort is S/M/L.

### Option 1 — Separate changelog streams (`CHANGELOG.md` + `DEPLOY-LOG.md`)

**Change surface**: `.changeset/config.json` (`changelog` key currently `@changesets/cli/changelog`) → a custom changelog module implementing changesets' `getReleaseLine`/`getDependencyReleaseLine`; new `DEPLOY-LOG.md`; probably a `scripts/post-release.d/` hook (that extension point already exists and is invoked by `release-watch.sh:~200`).

**What breaks**: a custom changesets changelog module is a new maintained surface coupled to changesets' internal API. ADR-007's Confirmation criterion pins `.changeset/config.json` — an amendment is required.

**What it does not fix**: nothing about the coupling. A deploy-only change still needs a changeset and still publishes a version. It relabels the noise instead of removing it, and it adds a hand-maintained ledger that duplicates `git log -- deploy/` plus the Actions run history — a second source of truth that will drift.

**Effort**: M. **Verdict**: treats symptom 2 only, and treats it worse than Option 4 does incidentally.

### Option 2 — Changeset typing (`npm` / `saas` / `both`)

**Change surface**: changesets has no type/tag concept, so this is a convention plus custom pipeline logic — a new parse step in `release.yml` placed _before_ the changesets action, a routing script, changed gates on all four deploy-path steps, and rework of the P044 assertion.

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
- Widen the three deploy-path gates from `steps.changesets.outputs.published == 'true'` to `success() && (steps.changesets.outputs.published == 'true' || inputs.deploy_only == true)` (release.yml:190, 229, 233). **Unquoted `true`** — see the boolean-form correction above; the string form ships the fix inert.
- Add `&& inputs.deploy_only != true` to the P044 assertion (release.yml:154). Without it a deploy-only run reaches the assertion and _passes_ (local version equals npm version), but it would be asserting something the run is not doing.

**Unchanged**: `deploy/deploy.sh`, `deploy/main.tf`, `deploy/vars.tf`, `package.json`, `.changeset/**`, `CHANGELOG.md` generation, `scripts/release-watch.sh`. The publish→deploy path is byte-identical, so the one-way asymmetry holds **by construction** rather than by careful re-gating.

**Why it also fixes symptom 2**: once infra-only changes no longer need a changeset, `CHANGELOG.md` stops accreting SaaS-only entries. No `DEPLOY-LOG.md` needed — `git log -- deploy/` plus the Actions run list already is the deploy log, with no drift risk.

**Costs and open risks** (the user should decide with these visible):

1. **ADR-001 risk gate is bypassed.** The release risk gate is plugin-owned (wr-risk-scorer's `git-push-gate.sh`; there is no repo-local `.claude/hooks/` directory) and fires on `npm run release:watch`. A `workflow_dispatch` deploy has no equivalent wrapper, so it reaches prod without a risk score. Mitigations: accept it (a manual dispatch is a deliberate human action, and the full smoke-test block still runs and still fails the deploy), or add a thin `npm run deploy:watch` wrapper later that dispatches and watches under the same gate.
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
