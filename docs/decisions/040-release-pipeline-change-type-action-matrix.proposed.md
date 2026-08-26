---
human-oversight: confirmed
oversight-date: 2026-07-27
status: 'proposed'
date: 2026-07-26
decision-makers: [Tom Howard]
consulted: []
informed: []
reassessment-date: 2027-01-26
---

# ADR 040: Release Pipeline Decoupled into a Change-Type to Action Matrix

> **Oversight note.** The substance of this decision — three independent axes, the SHA-based tag scheme, CI as the Docker publisher, and auto-deploy on a `deploy/**` change — was taken by the user on 2026-07-26. This ADR was authored by an AFK iteration with no interactive access, so it is born `human-oversight: unconfirmed` for the `/wr-architect:review-decisions` drain to promote rather than self-certifying. The architect review noted that the substance is user-pinned and the marker could reasonably be born `confirmed`; the drain should be able to promote it quickly. [ADR 039](039-distroless-docker-runtime.proposed.md) is in the same state and **must be ratified in the same pass** — this ADR amends it in three places, and stage 2 must not land ahead of that drain.
>
> **Ratified 2026-07-27 (recorded 2026-08-05).** The drain ran and promoted both ADRs in one pass: this ADR and ADR 039 each carry `human-oversight: confirmed` with the identical `oversight-date: 2026-07-27`, and that identical date is the evidence of the single drain — it is load-bearing for the retirement of register entries R024 and R026 and must not be re-issued. The paragraph above is retained as provenance for how the substance was taken, not as a description of the current marker state. Stage 2 did land ahead of the drain, on 2026-07-26 by user direction; that is recorded in the stage-2 amendment below and struck from Confirmation criterion 1, because a violated ordering clause can never be ticked and an unsatisfiable criterion is worse than none.
>
> **One gap the marker does not cover.** The 2026-07-28 GHCR amendment — a registry, namespace and credential change — post-dates `oversight-date: 2026-07-27` by a day, so the confirmed marker does not strictly cover this ADR's current content. The substance was separately user-pinned: the user chose GHCR on 2026-07-28 after a Docker registry auth-token scope probe, recorded in that amendment. So the substance is confirmed and only the marker date was not re-issued, which is a provenance-recording gap rather than an unconfirmed-substance gap. Recorded here rather than left implicit, which is what allowed R024 and R026 to retire.

## Amendment 2026-07-26 (stage 2, as built)

Stage 2 landed the Docker publisher. The shape the user directed differs from the topology recorded below, and the differences are recorded here rather than re-litigated.

**1. `docker-image.yml` keeps its push-to-master trigger and publishes on it.** The topology section says that trigger "reduces to pull-request-only". It does not. The input is `publish_semver` (does the bare `:<semver>` get written) rather than `push` (does anything get written at all), and guard 1 of the two independent guards becomes an inline `if: github.event_name != 'pull_request' && github.ref == 'refs/heads/master'`. That substitution is sound for the driver it exists to serve: on a same-repo pull request the secrets _are_ available, and the inline gate blocks it on two independent conjuncts, since a `pull_request` event also carries `github.ref` of `refs/pull/N/merge`. Guard 2 is unchanged and now checks **both** secrets, not just the user — `predocker:push` logs in whenever `DOCKER_ID_USER` is set, so a set user with an empty password would fail `docker login` and red master, which is precisely what guard 2 exists to prevent. A `workflow_dispatch` against master also publishes, which it did not before: accepted as break-glass, and bounded, because `publish_semver` is unset on a dispatch so it can move `:latest` and mint a fresh `:<version>-<gitsha>` but can never re-point a consumer's bare-semver pin.

**2. Build, smoke, and publish stay in one job, not a reusable definition invoked twice.** This is the stronger shape, and the reasoning belongs in the record rather than in a review transcript. A separate `needs:` job must either rebuild or ship the image through the artifact store. Rebuilding is disqualified outright: [ADR 039](039-distroless-docker-runtime.proposed.md) accepts a floating `:nonroot` base and non-reproducible builds, and the compensating control it names for declining the digest pin is exactly that the pushed image is the smoke-tested image. A second build would publish a digest no smoke test ever ran against, silently voiding that control. The artifact route ships hundreds of megabytes per master push to buy nothing. The single-definition property the topology section wanted is preserved either way: there is still exactly one place that builds.

**3. The double-publish guard has no home, and stage 3 is blocked until it gets one.** This is the real cost of point 1 and it is not yet paid. A changesets release commit touches `package.json`, which is in this workflow's own push path filter. At stage 3 the same commit would fire both the push trigger and `release.yml`'s `workflow_call`, publishing twice — and because the two builds can resolve different floating base layers, the second would **re-point `:<version>-<gitsha>`**, falsifying the immutability property that is this ADR's headline driver. Stage 2 is unaffected: `release.yml` publishes no image today, so a release commit fires the docker path exactly once. Four candidate reconciliations, for the user to pin before stage 3 is designed:

- **A. `release.yml` retags rather than rebuilds.** Drop the `workflow_call` invocation; the master-push run is the sole builder, and the release adds one `docker buildx imagetools create` step aliasing the bare `:<semver>` onto the already-published `:<version>-<gitsha>` digest. Dissolves the race by construction and makes `publish_semver` unnecessary.
- **B. Suppress the push-triggered publish on release commits.** Keep the `workflow_call` shape and add a conjunct excluding the changesets commit message, which is a fixed in-repo string. Closest to the topology below; couples the docker axis to a commit-message convention.
- **C. Drop `package.json` / `package-lock.json` from the push path filter.** Structurally simple; costs the ADR 035 `SEARCH_IMAGE*` trigger recorded in the consequences below, and a lockfile-only bump would stop rebuilding the image.
- **D. Accept the double publish.** Only defensible if the sha tag becomes push-authored and `release.yml` publishes bare semver alone — a variant of A without the digest guarantee.

The exposure is pinned mechanically in `test/js/__tests__/docker-image-workflow.test.mjs` so stage 3 cannot land past it unnoticed.

**4. Two Confirmation criteria are corrected.** `grep -c 'docker build'` across `.github/workflows/` returns **0**, not 1, and did before this change: the literal lives in `package.json`, and the workflow runs `npm run build:docker`. An unsatisfiable criterion is worse than none, so the predicate becomes "exactly one workflow line matching `run: npm run build:docker`", asserted in the stage-2 test. And the `github.event_name == 'push'` path-detection scoping partly dissolves for the docker axis: the native `on.push.paths` filter _is_ the path detection and GitHub cannot fire it on a dispatch, so the empty-string coercion trap has no surface here. It remains live for whatever stage 3 does with `published`, so the criterion is reworded rather than deleted.

**5. Concurrency moved to job scope.** In a called workflow `github.workflow` resolves to the **caller's** name, so the workflow-level `${{ github.workflow }}-${{ github.ref }}` group would be byte-identical to `release.yml`'s own group at stage 3 and deadlock — the caller waiting on the callee, the callee queued behind the caller. The group is now the job-level literal `docker-image-${{ github.ref }}`, matching the shape `reusable-update.yml` already uses. Side effect worth having: at stage 3 the two runs serialize rather than race.

**6. `DOCKER_PUBLISH_SEMVER` is set at job scope.** `build:docker` and `docker:push` both derive their tags from `scripts/docker-tags.sh`. At step scope the build would tag two images and the push would try to push three, failing on a tag that was never created — on a release, which is the worst place to find out.

**7. The pull-request path filter gains `package.json` and `package-lock.json`.** Without them a dependency bump was publishable on merge without the image ever having been built in the pull request. The cost is that every dependency-bump pull request now runs a full image build and container smoke.

**Two windows this opens, neither closed here.** Between stage 2 and stage 3 nothing sets `publish_semver`, so the bare `:<semver>` stays a manual `DOCKER_PUBLISH_SEMVER=1 npm run docker:push`: "CI is the only publisher once stage 2 lands" is true for two tags of three, and a green run must not be read as "the release image shipped completely". And the JTBD-202 gap — the operator tag contract that no documented job owns — stops being deferrable when the **secrets are added**, not when stage 3 lands, because that is the moment an operator tracking `:latest` starts receiving trunk builds.

**Ratification ordering was not honoured.** The first Confirmation criterion says stage 2 does not land before ADR 039 and ADR 040 are ratified in one `/wr-architect:review-decisions` drain. Stage 2 landed first. The drain needs interactive oversight and stage 2 was built by an AFK run that had none; the user directed it to land. Recorded here so the drain sees the deviation rather than inheriting it silently. Both ADRs still need ratifying in one pass, and this amendment is part of what that pass ratifies.

## Amendment 2026-07-27 (stage 3, as built)

Stage 3 wired the three axes together. **The stage-2 blocker recorded at point 3 above is RESOLVED**: the user pinned **option C** from the four candidates. The shape differs from the topology recorded below in ways that are recorded here rather than re-litigated.

**1. Option C, and what it actually buys.** `package.json` and `package-lock.json` are removed from `docker-image.yml`'s **push** path filter and kept on its **pull_request** filter. A changesets release commit touches `package.json`, `package-lock.json`, `CHANGELOG.md` and the deleted `.changeset/*.md` — none of which remain on the push filter — so the release commit no longer self-fires the standalone publish, and `release.yml` is the sole publisher on it. State this as "the collision is removed **for every commit `changesets/action` authors**", not "by construction": a release PR hand-edited to also touch `Dockerfile`, `.dockerignore.tmpl` or `docker-image.yml` would still fire both paths at one sha and re-point `:<version>-<gitsha>`. That residual is **accepted** and needs no mechanism; it is far rarer than the exposure it replaces. The asymmetry between the two filters IS the guard, which makes it a prime candidate for a "these lists have drifted, let us re-sync them" tidy-up — so it is pinned in `test/js/__tests__/docker-image-workflow.test.mjs`, mutation-verified, with the filters sliced and asserted independently.

**2. The double-publish guard is DELETED, and with it the empty-string trap.** The matrix row below and the sentence "The `&& published != 'true'` conjunct on the docker axis is the double-publish guard" are both superseded. The docker axis now reads: `published == 'true'` (the release path, via `workflow_call`, `publish_semver: true`) **OR** a push to `master` touching `Dockerfile` / `.dockerignore.tmpl` / the docker workflow file. Second, independent benefit: the empty-string coercion trap warned about below **does not bite this design**. That trap was specific to the _negated_ `!= 'true'` conjunct, and both surviving gates use the _positive_ `== 'true'` form, against which an empty string is correctly false. Deleting the conjunct is what removes the trap, which discharges half of Confirmation criterion 5.

**3. The "why it lives in `release.yml`" rationale is SUBSTITUTED, not merely weakened.** The stated reason — the guard is unimplementable across a workflow boundary — evaporates with the guard. The conclusion survives for a different reason, recorded here so a load-bearing "why" is not left standing on a premise that no longer holds: `release.yml` must read `published` to decide whether to pass `publish_semver: true`, i.e. the release-only bare-`:<semver>` rule is now the reason the docker publish path lives there.

**4. The topology bullet is deviated from a THIRD way.** "Its push-to-master trigger reduces to pull-request-only" was already deviated from by stage 2 (point 1). Stage 3 refines that again: the push trigger **survives with a narrowed path filter**, which is a distinguishable shape from both the original text and stage 2's. Note also that the user's pin was phrased "Dockerfile/.dockerignore.tmpl only = a true docker-only change" while the implemented filter also retains `.github/workflows/docker-image.yml`; that matches the matrix row's own "or the docker workflow files" wording and is not a contradiction.

**5. Stage 3 is not inert, and the reason is non-obvious.** In a `workflow_call` context `github.event_name` and `github.ref` resolve to the **caller's** values — `push` and `refs/heads/master` on a release — so `docker-image.yml`'s inline publish gate is true when called from `release.yml`. Had they resolved to the callee, stage 3 would have shipped a publish that never fires.

**6. The deploy axis excludes `deploy/.terraform.lock.hcl`, which is a narrowing of the user's pin.** The detection step diffs `github.event.before`..`GITHUB_SHA` under `deploy/`, then filters that one path out. A provider-lock bump carries no infra intent of its own and is the likeliest file to be swept incidentally into an unrelated push, so leaving it in would let routine lockfile churn arm a push-tier production Terraform apply. A deliberate provider upgrade instead goes through the `deploy_only` dispatch, which the wr-risk-scorer gate intercepts at **release** tier via the `release:watch` command prefix — strictly better governance for that change class. The exclusion **announces itself** with a `::notice::` naming the dispatch, so it can never be a silent no-deploy. Introduced as a risk remediation when the commit-tier score came in above appetite with a modified `deploy/.terraform.lock.hcl` sitting in the working tree; recorded here because it narrows an axis the user specified as `deploy/**`.

**7. `release.yml` became multi-job, and the release watcher could not see it.** `scripts/release-watch.sh` checked only `select(.name == "release") | .conclusion` — under a comment reading "Release is a single job" — while swallowing `gh run watch`'s exit code with `|| true`. Adding `docker-publish` would therefore have printed "Release workflow completed successfully" while the image publish was red, **after** npm publish and the prod deploy had already gone through. That is the P004 false-negative class on a new surface. The check is now written against the whole job set (`select(.conclusion == "failure") | select(.name != "check-deps")`), names the failed jobs, and is pinned with a negative assertion against the old shape so re-introducing it is red rather than silent. Recorded as a consequence of this ADR: making the pipeline multi-job is what broke the watcher's assumption.

**8. New Bad consequences, and one correction.** The `SEARCH_IMAGE*` consequence recorded below is **corrected in place** — that trigger no longer exists — and option C's cost is broader than the single line the stage-2 amendment anticipated:

- **Dependency changes no longer publish on merge.** They are still built and smoke-tested in the pull request, so build _verification_ is intact; what is lost is _publish_ coverage. Bounded for anything carrying a changeset (the next release publishes it), and **unbounded** for a devDependency or lockfile-only bump that never earns one. `:latest` can drift from master indefinitely for that class, which includes a transitive-CVE fix landing without a changeset.
- **The docker build and push machinery itself stops being a trigger.** `build:docker`, `prebuild:docker`, `docker:push` and `predocker:push` all live in `package.json`, so editing the docker publish machinery no longer fires the docker axis on master.
- **`scripts/docker-tags.sh` is not on the push filter.** This gap is **pre-existing**, not created here — that path was never on the filter and editing it alone never touched `package.json`. What option C changes is its blast radius: `package.json` was previously covering script-side changes incidentally. Adding `scripts/docker-tags.sh` to the push filter is the obvious remedy if it bites; **declined for now** because the user pinned the filter contents.
- **The `deploy/**` axis inherits the P044 fail-closed coupling.** The swallowed-publish assertion sits upstream of the deploy steps in the same job and none of its conjuncts exclude a `deploy/**`-only push, so if `package.json` is ever strictly ahead of npm, a pure infrastructure push fails that assertion and skips the deploy. Narrowing it would add a fourth conjunct to an already-subtle predicate for a rare state, and declining to apply Terraform from a tree with a known-broken release state is the right default. **Recorded, not fixed.**
- **`:latest` changes meaning a THIRD time** — from "the latest release" (ADR 013 / ADR 039), to "the latest trunk build" (recorded below), to "the latest Dockerfile-or-release build" under option C, with trunk dependency changes excluded. That third meaning is documented nowhere, `docs/DOCKER-IMAGE-CHANGELOG.md` included.

**9. JTBD-400 moves from STALE to FACTUALLY CONTRADICTED, and this is not the stage-1 note repeated.** The stage-1 review's position that this work "does not widen the gap" is explicitly **not carried forward to stage 3**. Through stage 2 the JTBD-400 Desired Outcome was merely incomplete — no auto-deploy trigger existed, so it was an omission. Stage 3 is the commit that makes it **false**, on both clauses: "the dispatch remains operator-initiated by design" (there is now a second, non-operator-initiated path) and "the compensating control is that it is the one gated path" (that compensating control no longer exists). Its third clause — that variant 4b is "deliberately deferred until the manual path has been exercised" — is contradicted too: `--deploy-only` has been dispatched **zero** times and the user lifted the deferral on 2026-07-26 regardless. The ADR-001 amendment discharges **this ADR's own prerequisite**; it does **not** discharge the JTBD-400 contradiction. Those are separate obligations. JTBD-400 is `human-oversight: confirmed` and this run had no interactive access, so it is recorded here and mirrored onto P039 (the ticket that authored the contradicted outcome) and P055, for the `/wr-jtbd:confirm-jobs-and-personas` batch to action.

**10. A fourth JTBD-202 desired outcome is requested.** P055's pending JTBD-202 request carries three (shell-loss, tag-pinning, SIGTERM/grace-window). Option C adds a fourth: **image currency** — under what circumstances a dependency or security fix reaches `:latest`, and the maximum staleness an operator tracking `:latest` should expect. Option C makes that bound release-cadence-dependent, and no job statement in `docs/jtbd/` exists against which "a CVE fix waits for the next changeset" can be judged acceptable.

**11. Confirmation criterion wording corrected.** The criterion asserting the `github.event_name == 'push'` scoping says it is "pinned in the stage-2 test", but the path-detection step lives in `release.yml`, so it is pinned in `release-workflow-deploy-only.test.mjs`. Corrected below so the drain does not go looking in the wrong file.

**12. ADR 039 is corrected directly, in the same pass.** Two of its statements are wrong against disk and get wronger at stage 3 — that the build and smoke steps "move into" a reusable definition (nothing moved; `docker-image.yml` _is_ the definition and gained `workflow_call` in place, with a `publish_semver` input rather than a `push` one), and that the definition is "invoked by both the release path and the pull-request path" (at stage 3 the pull-request path fires through `docker-image.yml`'s own `on.pull_request` trigger, not through `workflow_call`). This is the second round of recording those two sentences as wrong elsewhere; they are fixed in ADR 039's body instead.

**Ratification ordering was not honoured, for the SECOND time.** Stage 2 landed ahead of the `/wr-architect:review-decisions` drain by user direction, and stage 3 now does the same. This is the stage-2 precedent being **reused**, not a one-off, and it is recorded as its own deviation rather than inherited silently. The drain must ratify ADR 039, ADR 040, **and both the stage-2 and stage-3 amendments** in one pass. A third reuse should not happen without the drain running.

## Amendment 2026-07-28 (registry moved to GHCR)

Mountain Pass no longer uses Docker Hub. The published image moves from Docker Hub `mountainpass/addressr` to **GitHub Container Registry `ghcr.io/mountain-pass/addressr`**, authenticated by the built-in `GITHUB_TOKEN`. This **discharges the Reassessment Criterion below** — _"Docker Hub is replaced by another registry… the tag scheme is registry-agnostic but the credential handling is not."_ The trigger fired; this is its resolution. The decision _outcome_ is unchanged: three axes, the SHA-based immutable tag scheme, CI as the publisher. Only the registry host, namespace, and credential handling change. The user pinned GHCR on 2026-07-28 after a Docker registry auth-token scope probe confirmed the CI account has push on GHCR but only pull on the Docker Hub org.

**1. Credential handling — the part the tag scheme is not agnostic about.** `DOCKER_ID_USER` / `DOCKER_ID_PASS` are gone. Auth is the workflow's built-in `GITHUB_TOKEN` with a `packages: write` permission grant. `docker-image.yml` gains `permissions: {contents: read, packages: write}`; `release.yml`'s `docker-publish` job grants the same, because a reusable-workflow callee's token scope cannot exceed the caller's. `predocker:push` logs in to `ghcr.io` with `GITHUB_TOKEN` (username `github.actor`) instead of the Docker Hub pair.

**2. Guard 2 is retired, and guard 1 now carries the whole boundary.** The stage-2 amendment's guard 2 ("both secrets must be non-empty; absent, the step no-ops, which is what let the wiring land before the secrets existed") is **moot**: `GITHUB_TOKEN` is _always_ present in Actions, so there is nothing to be absent and nothing to land ahead of. The publish is now guarded by guard 1 alone — the inline `if: github.event_name != 'pull_request' && github.ref == 'refs/heads/master'`. This is not a weakening: on a **fork** pull request `GITHUB_TOKEN` is read-only (no `packages: write`), so even were guard 1 removed the push would fail closed. Guard 1 remains the load-bearing gate; the fork-token restriction reinforces it.

> **SUPERSEDED by [ADR 050](050-the-image-follows-the-publish-not-the-deploy.superseded.md).** This describes the re-credentialed shape of a break-glass that is no longer sanctioned. Recorded because amendments outrank body text here, so retiring the body-text site alone would leave this reading as live.

**3. Break-glass changes shape.** A local `npm run docker:push` no longer uses Docker Hub credentials; it now needs a classic **PAT with `write:packages`** exported as `GITHUB_TOKEN` (or `docker login ghcr.io` beforehand). `predocker:push` skips the login with a message when `GITHUB_TOKEN` is unset, so a plain local `docker:push` prints the skip and then fails the push against `ghcr.io` rather than silently succeeding — recorded so it is not a surprise.

**4. Namespace asymmetry is intentional — do not "reconcile" it.** The npm scope stays `@mountainpass` (no hyphen); the GHCR namespace is `mountain-pass` (hyphenated, the GitHub org login). They are different identifiers for different registries and are correct as written. A future tidy-up that makes them match will break one of them.

**5. GHCR packages are private by default.** A freshly-pushed GHCR package is private until its visibility is set to **public**, and JTBD-202's anonymous-pull outcome depends on public. This is not enforced by any code, so it is captured as a Confirmation criterion below. A green publish with a private package still 401/404s the operator pull — the highest-value check in this migration.

### Confirmation (this amendment)

- [ ] After the first GHCR publish, `docker pull ghcr.io/mountain-pass/addressr:latest` succeeds **with no `docker login`** (package visibility is public).
- [ ] `docker-image.yml` and `release.yml`'s `docker-publish` job both declare `packages: write`, and no `DOCKER_ID_*` reference remains in either workflow, `package.json`, or the pinning tests.
- [ ] `scripts/docker-tags.sh` emits `ghcr.io/mountain-pass/addressr:*` tags; pinned in `test/js/__tests__/docker-tags.test.mjs`.
- [ ] `docs/DOCKER-IMAGE-CHANGELOG.md` records the registry move as a breaking change with the new pull command.

## Context and Problem Statement

The pipeline has one trigger and three effects welded to it. A merged changesets release PR publishes to npm, and the same job then deploys to production. The Docker image is outside CI entirely — a human runs `npm run build:docker` and `npm run docker:push` from a laptop.

The consequence is that the _only_ way to make anything happen is to bump the npm version. [P039](../problems/closed/039-decouple-saas-deployment-from-npm-publish.md) recorded the two symptoms: a long run of commits carrying a changeset while touching zero files that ship in the npm tarball, purely to move an infra change to prod; and a `CHANGELOG.md` that conflates three audiences, telling an npm consumer about a Terraform edit that cannot affect them.

[P055](../problems/known-error/055-migrate-docker-image-alpine-to-distroless.md) is the same coupling seen from the Docker side. The Distroless rebuild changes nothing in the npm package — its own changeset says so in as many words — but it was given a patch changeset anyway, for one reason recorded honestly at the time: the image tag derives from `${npm_package_version}`, so without a version bump the next `docker:push` would retag an already-published version with a materially different image. A tagging deficiency was forcing a version bump, and the version bump was in turn dragging an npm publish and a production deploy along behind it.

[ADR 001](001-risk-gated-release-process.proposed.md)'s 2026-07-26 amendment cut the first strand by adding a publish-free `--deploy-only` dispatch. This ADR generalises that from one escape hatch into a matrix.

## Decision Drivers

- A change should trigger the actions it actually implies, and no others
- No axis may be reachable only by laundering the change through an unrelated axis
- Publishing an image must never silently re-point a tag a self-hoster has already pinned
- One definition per action, invoked from every path that needs it, so two paths cannot drift apart
- The change must not be able to red master before the user adds the Docker Hub secrets
  > **Premise retired by the 2026-07-28 GHCR amendment.** There are no secrets to add: auth is the workflow's built-in `GITHUB_TOKEN` with `packages: write`, which is always present. The driver is moot rather than wrong; retained because it shaped the two-guard design recorded below.
- Whatever governs a production deploy today must keep governing it

## Considered Options

1. **A change-type to action matrix with npm, docker, and deploy as independent axes**
2. **Keep the coupling and add more escape hatches** — a second dispatch input for docker, alongside `deploy_only`
3. **Split into three separate workflow files, one per axis**

Option 2 is the status quo's trajectory. Each hatch is cheap on its own and the set of them is a pipeline nobody can reason about; it also leaves the default path — a plain push — still doing the wrong thing. Option 3 gets the independence but loses the single-definition property: the deploy steps would exist in two files, and [ADR 001](001-risk-gated-release-process.proposed.md) already forbids that specific divergence for the deploy axis. It also cannot express the double-publish guard, for the reason set out under Decision Outcome.

## Decision Outcome

**Option 1: a change-type to action matrix, npm / docker / deploy as three independent axes.**

### The detection matrix

| Axis           | Fires when                                                                                                                                                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm publish    | A changeset is consumed — `steps.changesets.outputs.published == 'true'`                                                                                                                                              |
| docker publish | `published == 'true'` **OR** (a push to `master` touched `Dockerfile`, `.dockerignore.tmpl`, `package.json`, `package-lock.json`, or the docker workflow files **AND** `published != 'true'`)                         |
| deploy         | `published == 'true'` **OR** the `deploy_only` dispatch input — ~~**OR** a push to `master` touched `deploy/**`~~ **(third disjunct RETIRED 2026-08-10 — see the amendment of that date, which supersedes this row)** |

> **SUPERSEDED by the 2026-07-27 stage-3 amendment, points 1-3.** The docker-axis row is now `published == 'true'` **OR** a push to `master` touching `Dockerfile` / `.dockerignore.tmpl` / the docker workflow file — `package.json` and `package-lock.json` are off the push filter under option C, so the `&& published != 'true'` conjunct below is **deleted**, not merely unused. The deploy row gained a `deploy/**` exclusion for `deploy/.terraform.lock.hcl` (amendment point 6). The two paragraphs immediately below are retained as the historical reasoning; read the amendment for what is built.

The `&& published != 'true'` conjunct on the docker axis is the double-publish guard. A changesets release commit also touches `package.json`, so without it a release would satisfy both docker disjuncts and publish the image twice.

That guard is why the docker publish path lives **in `release.yml`**. `published` is an output of a step inside that workflow's `release` job; a separate workflow file triggered by the same push cannot read it, so the guard would be unimplementable across a workflow boundary. The `release` job therefore gains a declared job-level output exposing `steps.changesets.outputs.published`, and the docker publish job runs with `needs: release`.

> **Rationale substituted, conclusion unchanged (stage-3 amendment point 3).** With the guard deleted, "unimplementable across a workflow boundary" no longer holds. The docker publish path still lives in `release.yml`, for a different reason: only `release.yml` can read `published` to decide whether to pass `publish_semver: true`, which is the release-only bare-`:<semver>` rule. The job-level output and `needs: release` are built exactly as written above.

**Path detection is a plain `git diff --name-only` shell step, scoped to `github.event_name == 'push'`** — not a third-party filter action. Two reasons, both load-bearing. The job holds `DOCKER_ID_PASS`, so a marketplace action there would be registry-credential supply-chain surface.

> **Premise updated by the 2026-07-28 GHCR amendment.** `DOCKER_ID_PASS` no longer exists; auth is the workflow's `GITHUB_TOKEN` with `packages: write`. **The conclusion is unchanged and still load-bearing** — a write-scoped registry credential is still in the job, so a marketplace action there is still supply-chain surface. Only the secret's name has changed. Recorded per the stage-3 device: do not leave a load-bearing "why" standing on a premise that no longer holds. And the event scoping closes a silent-green trap: on a `deploy_only` dispatch the changesets step is skipped, so the job-level output resolves to the **empty string**, not `'false'`, which makes `published != 'true'` evaluate true. The second disjunct then rests entirely on path detection yielding nothing on a non-push event, so that must be explicit rather than incidental. This is the same class as the boolean-coercion trap already documented at `release.yml:18-24`.

### Topology — one definition per action

- **Deploy** keeps a single set of steps in `release.yml`, `if:`-gated on the disjuncts above — three as written, **two since the 2026-08-10 amendment**. Never forked into a second job, per [ADR 001](001-risk-gated-release-process.proposed.md).
- **Docker build, smoke, and push** become one reusable `workflow_call` workflow with an explicit `push` boolean input and declared `secrets:`. `release.yml` invokes it with `push: true`; `docker-image.yml` keeps validating pull requests by invoking the same definition with `push: false`, and its push-to-master trigger reduces to pull-request-only so there are not two definitions of "build the image on master". One definition, two callers — the anti-divergence guarantee. This follows the `workflow_call` shape `reusable-update.yml` already establishes in this repo.

### Docker tag identity

Every build writes:

- `:<version>-<gitsha>` — immutable, never re-pointed, the reproducible pin
- `:latest` — moves on every build

The bare `:<semver>` tag is written **only on a package release**. This is the property that lets P055's changeset be removed: a Docker-only rebuild can no longer collide with an existing consumer pin, so it no longer needs a version bump to avoid one.

Three facts about the scheme a reader will otherwise trip over:

- **Version alone stops identifying image content.** Two live images answer to "3.0.2": the already-published bare `:3.0.2` (Alpine, from before ADR 039) and `:3.0.2-<gitsha>` (Distroless). For a given version the `-<gitsha>` form is authoritative, and it is what a self-hoster should pin. The bare tag is a release-time convenience alias, not an identity.
- **The `-<gitsha>` suffix is applied in CI.** A consumer building from the npm tarball has no git repository, and ADR 039 has a standing driver that `npm run build:docker` must keep working unmodified for them. The scripts degrade to version-and-latest tagging when `git rev-parse` cannot answer.
- **The tag form inverts semver ordering.** See the Bad consequence below. The form is user-pinned; it is recorded rather than substituted.
- **"Immutable" means the tag names a commit, not a tree.** `prebuild:docker` packs the working tree, so a local build with uncommitted changes mints a `:<version>-<gitsha>` for content that is not what that sha contains, and a second dirty build at the same HEAD re-points it. CI is unaffected — it builds from a clean checkout — and CI is the only publisher once stage 2 lands. The exposure is confined to the manual break-glass path.

### CI as the publisher

Docker Hub credentials move to GitHub Actions secrets `DOCKER_ID_USER` / `DOCKER_ID_PASS`. The publish step is guarded twice, independently:

> **SUPERSEDED by the 2026-07-28 GHCR amendment.** There are no Docker Hub secrets: auth is the built-in `GITHUB_TOKEN` with `packages: write`. Guard 2 ("the secrets must be non-empty, else no-op") is **retired** — a token that is always present cannot be absent, so guard 1 now carries the whole boundary alone. The two-guard scheme below is the as-designed record, not current behaviour. See amendment points 1 and 2.

1. The reusable workflow only pushes when its `push` input is true — the pull-request caller passes false. This matters because on a same-repo pull request the secrets _are_ available, so secret-presence alone would let a PR build publish.
2. The publish step additionally requires the secrets to be non-empty, and no-ops cleanly when they are absent. The wiring can therefore land before the user adds them without turning master red.

> **SUPERSEDED by [ADR 050](050-the-image-follows-the-publish-not-the-deploy.superseded.md).** The scripts remain and the pipeline still invokes `docker:push` — what is withdrawn is their standing as a sanctioned MANUAL route. Registry pushes come from the pipeline (user direction 2026-08-19).

`predocker:push` and `docker:push` are **retained as documented break-glass**. Under the new tag scheme a local `npm run docker:push` no longer re-points an existing `:<semver>` pin, because the bare-semver tag is opt-in behind `DOCKER_PUBLISH_SEMVER=1`. `predocker:push` is an npm lifecycle hook that runs regardless of what the main script decides, so its guard lives in its own body: it skips the `docker login` with a message when `DOCKER_ID_USER` is unset rather than failing. `postdocker:push` is **removed** — it existed only to push `:latest`, and `docker:push` now pushes every tag the helper emits, `:latest` unconditionally among them. Deleting a hook whose whole body is covered by the main script is one less place for the two to disagree.

`start:server:docker` is re-pointed from the bare `:${npm_package_version}` to `:latest` in the same change. It resolves correctly today; the re-point is **hardening a forward invariant**, not repairing a defect — it is the only local consumer of the bare tag, and it would stop resolving once the bare tag becomes release-only. The invariant is pinned in Confirmation.

### The docker axis's news obligation

`docs/DOCKER-IMAGE-CHANGELOG.md` is the docker axis's consumer-facing news channel: keyed by image tag rather than npm version, appended by whoever lands a consumer-visible image change. It is the docker-axis counterpart to ADR 007's npm-scoped `CHANGELOG.md`, and having one per axis is the audience separation P039 symptom 2 asked for. It exists because `:latest` moves and because a docker-only publish produces no npm version and therefore no `CHANGELOG.md` entry — without it, an operator tracking `:latest` receives a breaking change with no versioned notice anywhere.

### The `deploy/**` axis, and what governs it

> **RETIRED 2026-08-10 — read this section in the past tense.** It describes an entry point that no longer exists. Retained as history rather than deleted: the decision was ratified and implemented, with six production applies behind it. Superseded by the 2026-08-10 amendment, which gives the ground — the detection predicate diffed a PATH, so a rename OUT of `deploy/` would itself have armed a production apply on a pure refactor.

This axis is [P039](../problems/closed/039-decouple-saas-deployment-from-npm-publish.md) variant 4b. [JTBD-400](../jtbd/addressr-maintainer/JTBD-400-ship-releases-reliably-from-trunk.validated.md) records it as **deliberately deferred until the manual `--deploy-only` path has been exercised a few times**. That precondition is **not met** — `--deploy-only` landed on 2026-07-26 and has been dispatched zero times. The user lifted the deferral on 2026-07-26 regardless. Recording it plainly rather than quietly satisfying the precondition on paper:

The other two deploy entry points carry a **release-tier** risk score, because the wr-risk-scorer gate matches on the `npm run release:watch` command prefix. A `deploy/**` path push carries only **push-tier** — the git-push gate sees `git push`, not `release:watch`. So this axis reaches a full production Terraform apply at a lower governance tier than either existing entry point, with no human intent and no opt-in. [ADR 001](001-risk-gated-release-process.proposed.md)'s accepted residual does not cover it: that residual is scoped to a _deliberate_ raw dispatch, which is a different class from an always-on automatic trigger.

ADR 001 is not amended here, but not because amending a `confirmed` ADR is off-limits — this repo does exactly that, in ADR 001's own 2026-07-26 block and in ADR 004 the same day. The reason is narrower: an ADR 001 amendment has to describe the trigger **as actually implemented**, and no trigger exists until stage 2. Writing it now would document a mechanism that is not there. So the amendment is a **hard prerequisite on the wiring**, enforced as a greppable predicate in Confirmation below, mirrored onto the P039 ticket for discoverability from the ADR 001 side, and pinned mechanically in the stage-2 test.

> **Amendment 2026-08-01 — a fourth, read-only axis.** The change-type→action matrix gains `terraform-plan.yml`: a `workflow_dispatch`-only job that plans the prod workspace and never applies.
>
> **The absence of an auto-trigger is deliberate**, not an omission. It carries no push or `pull_request` trigger for two reasons: the Terraform Cloud workspace is remote-state/local-execution, so a plan takes the workspace lock and would contend with an in-flight release; and a fork PR receives no secrets, making the resulting plan confidently wrong rather than merely failed. It shares `release.yml`'s concurrency group so it queues behind an apply instead of racing it.
>
> **What this axis is structurally blind to.** ~~`aws_s3_object.elasticapp` carries no `etag`/`source_hash`, so Terraform diffs only the key/source strings and a rebuilt deployment bundle produces no diff at all.~~ **CORRECTED 2026-08-10 — the struck claim is stale and was stated twice in this ADR.** A `source_hash` over the deployment manifest was added 2026-08-09 (`deploy/deploy.sh:14`), so Terraform CAN now see a manifest that disagrees with the version in its own name. What survives is the narrower caveat: the hash is over `deployment/package.json`, not over the zip — hashing the archive would diff on every run because it carries mtimes — so a green plan certifies the manifest this ref would generate, not the archive's bytes. This axis still verifies infrastructure _configuration_ only, and a green plan must still not be read as "the deployed artifact is correct".
>
> Pinned in `test/js/__tests__/terraform-plan-workflow.test.mjs` per this ADR's own Confirmation that the trigger be asserted in test rather than by grep.

## Consequences

- Good: a Docker-only change publishes an image and nothing else; an infra-only change deploys and nothing else; neither needs a version bump. P039 symptoms 1 and 2 are retired at the root rather than worked around
- Good: an existing `mountainpass/addressr:3.0.2` pin can never be re-pointed by a rebuild. Self-hosters gain a reproducible pin (`:<version>-<gitsha>`) they do not have today
- Good: image publishing stops depending on a human remembering to run it from a laptop with credentials on disk
- Good: one definition for the deploy steps and one for the docker steps, so the release path and the standalone path are the same code by construction
- Bad: **the tag form inverts semver ordering.** `X.Y.Z-<sha>` is a semver _pre-release_ of `X.Y.Z` and sorts **before** it, but `package.json` is not bumped until the release PR merges, so a trunk build tagged `X.Y.Z-<sha>` contains code strictly **newer** than the `X.Y.Z` release build. Renovate, Watchtower, Docker Hub's sort and humans all read the ordering backwards. `:master-<gitsha>` or `:<version>-post-<gitsha>` would preserve ordering. The `:<version>-<gitsha>` form was pinned by the user on 2026-07-26, so it is implemented as directed and the inversion recorded here for the ratification drain to confirm or overturn
- Bad: **`:latest` changes meaning**, from "the latest release" to "the latest trunk build". `prebuild:docker` packs the working tree, and the docker axis fires precisely when `published != 'true'`, so a master push publishes unreleased code and moves `:latest`. This drops the artefact-to-published-npm-version correspondence ADR 013 and ADR 039 established
- Bad: **an operator tracking `:latest` receives changes without asking for them** — which is exactly how the breaking Distroless change (no shell, loader by script path) will reach them. This is why `docs/DOCKER-IMAGE-CHANGELOG.md` exists and why it lands before the docker axis ever publishes
- Bad: ~~**the `deploy/**` axis reaches production at push-tier governance**~~ **— CONSEQUENCE RETIRED 2026-08-10 with the axis. It was accepted for 14 days and realised once (run `31252424980`).**, as set out above. Mitigated only by the ADR 001 amendment prerequisite, which must land before the trigger is wired

> **PARTIALLY SUPERSEDED by [ADR 050](050-the-image-follows-the-publish-not-the-deploy.superseded.md).** "A failing `release` job skips the docker publish" is no longer true on the publish path, and "not publishing from a red tree is desirable" is the judgement ADR-050 reverses. The P044 case still skips — but because P044 fires only when `published != 'true'` while the gate requires `== 'true'`, not because of `needs: release`.

- Bad: **fail-closed coupling.** With `needs: release`, a failing `release` job — including the P044 swallowed-publish assertion — skips the docker publish even for a pure `Dockerfile` change. Not publishing from a red tree is desirable, but it is a behavioural change from today's independent `docker-image.yml`

> **SUPERSEDED by [ADR 050](050-the-image-follows-the-publish-not-the-deploy.superseded.md).** The docker axis is no longer coupled to the deploy axis — `docker-publish` now carries `!cancelled()`, so a post-publish failure cannot skip the image. The "benign" ground below is also withdrawn: the manual `docker:push` it degrades to is no longer a sanctioned route. Realised in production on 2026-08-19 releasing 3.3.2.

- Bad: **on the publish path the docker axis is not independent of the deploy axis.** `needs: release` plus GitHub's implicit success requirement puts the docker publish behind the deploy, the 120s wait, and the whole prod smoke block. A red prod smoke after a successful npm publish leaves npm and Docker Hub divergent with no automatic retry. Benign — it degrades to today's manual `npm run docker:push` — but it is real, and it adds publish latency
- Bad: **the docker axis is independent in _what fires_, not in _latency_.** `release` carries `needs: build-and-test`, so a docker-only rebuild queues behind the full two-version OpenSearch matrix (`2.19.5`, `3.5.0`) that the standalone `docker-image.yml` bypasses entirely today
- ~~Bad: `SEARCH_IMAGE*` lives in `package.json`, so an OpenSearch CI pin bump under [ADR 035](035-opensearch-3-5-upgrade-2-19-ci-regression.accepted.md) is a docker-axis trigger.~~ **CORRECTED by the 2026-07-27 stage-3 amendment (point 8): option C removes `package.json` from the push filter, so an `SEARCH_IMAGE*` bump is no longer a docker-axis trigger at all.** The replacement consequences — unbounded `:latest` drift for changeset-less dependency bumps, the docker build/push machinery in `package.json` ceasing to be a trigger, the pre-existing `scripts/docker-tags.sh` gap whose blast radius this widens, the `deploy/**` axis inheriting the P044 fail-closed coupling, and `:latest` changing meaning a third time — are recorded there
- Bad: two secrets now exist in CI that can push to a public registry. The two independent guards above are what keeps a pull request from reaching it
  > **Both halves superseded by the 2026-07-28 GHCR amendment.** There are no longer two secrets: auth is the workflow's built-in `GITHUB_TOKEN` with `packages: write`. And there are no longer two guards — guard 2 was retired with the secrets, so guard 1 carries the boundary alone. The consequence itself survives in altered form: a write-scoped registry credential is still present in CI, and a single guard now keeps a pull request from reaching it.
- Neutral: **prod cannot be reached by the docker axis.** [ADR 004](004-aws-elastic-beanstalk-deployment.accepted.md) runs Elastic Beanstalk on a Node.js 22 / AL2023 **source-bundle** platform, not a container platform. That is the structural fact that makes the docker and deploy axes genuinely independent rather than merely separately triggered
- Neutral: [ADR 010](010-devcontainer-ci-deployment.accepted.md)'s devcontainer requirement is scoped to the deploy step. The docker reusable workflow runs on a plain runner and does not implicate it

### Confirmation

Stage 1 (this ADR, the ADR 039 amendment, the tag scheme in `package.json`, `docs/DOCKER-IMAGE-CHANGELOG.md`, README tag guidance, the P055 reconciliation, the compendium) is complete when the commits land. The axes themselves are confirmed by stages 2 and 3, against these criteria:

- [x] **Ratification ordering.** ADR 040 does not reach `accepted` ahead of [ADR 039](039-distroless-docker-runtime.proposed.md), and both are ratified in one `/wr-architect:review-decisions` drain. **Discharged 2026-07-27**: both ADRs carry `human-oversight: confirmed` with the identical `oversight-date: 2026-07-27`, which is the evidence of the single drain, and neither has reached `accepted`. The third clause as originally written — "Stage 2 does not land before that drain" — was violated on 2026-07-26 by user direction and is **permanently unsatisfiable**, so it is struck rather than left to block the box forever; the deviation is recorded above and at the amendment note, which is where a historical fact belongs. A criterion nobody can ever tick is worse than none (this ADR's own stage-2 amendment, point 4)
- [ ] **Prerequisite, mechanically checkable:** `.github/workflows/release.yml` contains no `deploy/**` path-detection step unless `docs/decisions/001-risk-gated-release-process.proposed.md` contains an amendment block naming the `deploy/**` entry point and its push-tier score. Asserted in `test/js/__tests__/release-workflow-deploy-only.test.mjs`, not left to a human grep
- [ ] `test/js/__tests__/release-workflow-deploy-only.test.mjs` is **updated, not deleted**. It pins the deploy gate as an exact string with an occurrence count of 3; a third disjunct changes both. Its "Known limitation (accepted)" note is revisited in the same change
- [ ] The `release` job declares a job-level output for `steps.changesets.outputs.published`, and the docker publish job reads it via `needs.release.outputs`
- [x] The path-detection step is scoped `github.event_name == 'push'`, and that scoping is pinned in **`test/js/__tests__/release-workflow-deploy-only.test.mjs`** — corrected from "the stage-2 test", which named the wrong file: the step lives in `release.yml`, not `docker-image.yml`. The `!= 'true'` half of this criterion is discharged differently than anticipated: the negated conjunct that created the empty-string trap was deleted outright (stage-3 amendment point 2), and both surviving gates use the positive `== 'true'` form
- [ ] The docker build/smoke/push steps exist in exactly one file. **Predicate corrected** (stage-2 amendment point 4 declared the original unsatisfiable and the replacement was never written into this checklist): `grep -c 'docker build'` across `.github/workflows/` returns **0**, not 1, and always did — the literal lives in `package.json` and the workflow runs `npm run build:docker`. The predicate is therefore "exactly one workflow line matching `run: npm run build:docker`"
- [ ] `.github/workflows/docker-image.yml`'s header comment is rewritten. It currently asserts the job does not push, that publishing stays manual, and that the job therefore cannot leak a registry credential — a security claim that stops being true when the `push` input lands
- [ ] `start:server:docker` resolves to a tag `build:docker` produces
- [ ] A push to `master` touching only `Dockerfile` publishes an image and does **not** publish to npm and does **not** deploy
- [ ] A changesets release publishes to npm, publishes the image **once** (not twice), and deploys
- [ ] ~~A push to `master` touching only `deploy/**` deploys and does **not** publish to npm or to GHCR~~ (was "Docker Hub" — retired by the 2026-07-28 GHCR amendment) — **STRUCK 2026-08-10**: the `deploy/**` push axis is retired, so this box can never be ticked. Struck rather than deleted, per this ADR's own stage-2 rule that _an unsatisfiable criterion is worse than none_ — the same treatment its ratification-ordering criterion received.
- [ ] Credential handling: **see the 2026-07-28 GHCR amendment's own Confirmation bullet** on `packages: write` and no remaining `DOCKER_ID_*` references. The Docker Hub credential-skip criterion this replaces is retired. Stated as a cross-reference rather than restated, so one check does not become two independently-tickable boxes that can disagree
- [ ] A pull request touching `Dockerfile` builds and smoke-tests the image and does **not** push, with the secrets present
- [ ] `docker manifest inspect ghcr.io/mountain-pass/addressr:<version>-<gitsha>` resolves after a docker-axis publish, and the bare `:<version>` digest is unchanged by that publish

### Reassessment Criteria

- ~~The `deploy/**` axis fires an unintended production deploy — reconsider whether it should require the dispatch after all.~~ **DISCHARGED AND CLOSED 2026-08-10** — it fired once (run `31252424980`, P095), was answered "no" on 2026-08-08, and the axis then retired on an independent structural ground. No axis remains for this criterion to watch. Original note follows: Note this is no longer a live fallback position JTBD-400 still holds: as of stage 3 that outcome is **contradicted**, not merely stale (stage-3 amendment point 9), so reverting to it would be a fresh decision rather than a return to the documented state
- The semver-ordering inversion causes a real misresolve for a consumer or an automated updater — switch to `:master-<gitsha>` or `:<version>-post-<gitsha>`
- The npm and docker axes stop having distinct audiences — for example the package starts shipping the image, or vice versa — at which point re-coupling them may be simpler than maintaining the matrix
- Docker Hub is replaced by another registry, or the project publishes to more than one — the tag scheme is registry-agnostic but the credential handling is not
- `docs/DOCKER-IMAGE-CHANGELOG.md` goes stale across two or more docker-axis publishes — the news obligation needs automating rather than remembering
- Serialization behind the OpenSearch test matrix becomes a real cost for docker-only changes — split the docker publish job out of the `needs: build-and-test` chain, accepting that it then needs another way to read `published`

## Related Decisions

- [ADR 001](001-risk-gated-release-process.proposed.md) — owns the deploy axis and its risk gating. **Requires an amendment before the `deploy/**` trigger is wired**, per Confirmation above
- [ADR 004](004-aws-elastic-beanstalk-deployment.accepted.md) — the source-bundle platform fact that makes the docker and deploy axes structurally independent
- [ADR 007](007-changesets-versioning.accepted.md) — changesets remain the npm axis's trigger, unchanged. A changeset now means "the package changed", not "make something happen"
- [ADR 010](010-devcontainer-ci-deployment.accepted.md) — scoped to the deploy step; the docker workflow runs on a plain runner
- [ADR 013](013-docker-image.superseded.md) — recorded "Docker Hub image currency depends on manual builds" as a separate design question, out of its own scope. This ADR is the answer to it
- [ADR 015](015-dry-aged-deps.accepted.md) — `dry-aged-deps` covers npm dependencies only, not base-image tags. See the ADR 039 amendment for why that gap is re-accepted rather than closed here
- [ADR 035](035-opensearch-3-5-upgrade-2-19-ci-regression.accepted.md) — its `SEARCH_IMAGE*` pins live on a docker-axis trigger path
- [ADR 039](039-distroless-docker-runtime.proposed.md) — **amended** by this ADR in three places: the tag scheme supersedes its version-only tagging, its build-only scope note is closed by CI-as-publisher, and its base-image digest-pin reassessment trigger is assessed and declined. Ratify both in the same drain pass

## Follow-ups Requiring Interactive Oversight

These are edits to `human-oversight: confirmed` artefacts, which this AFK run had no interactive access to. They batch into a single `/wr-jtbd:confirm-jobs-and-personas` run, and are recorded here and on [P055](../problems/known-error/055-migrate-docker-image-alpine-to-distroless.md) per the precedent that ticket set. The JTBD review's position is that stage 1 does not widen this gap — it preserves operator news that would otherwise be deleted with the changeset — but the gap is acknowledged, not discharged.

- **JTBD-400 is CONTRADICTED on disk** (escalated from "stale" by the 2026-07-27 stage-3 amendment, point 9). Through stage 2 its Desired Outcome was merely incomplete; stage 3 is the commit that makes it false, on all three clauses — "the dispatch remains operator-initiated by design", "the compensating control is that it is the one gated path", and the variant-4b deferral itself. It must be amended to record the lift and the reasoning replacing the "manual path exercised" precondition. Mirrored onto P039, which authored the contradicted outcome, and onto P055
- **JTBD-400 `screens:` omits** `package.json`, `Dockerfile`, `.github/workflows/docker-image.yml`, `.dockerignore.tmpl`, and the new `docs/DOCKER-IMAGE-CHANGELOG.md` — all central to this change, and one of which already annotates itself `@jtbd JTBD-400`
- **JTBD-202 does not exist.** P055 already requests `JTBD-202: Operate and troubleshoot a self-hosted Addressr container`. The tag contract belongs in it — which tag to pin, what `:latest` promises, when a pinned tag can and cannot change, and how an operator learns an image changed. P055's own `JTBD: JTBD-200` header re-points at it once it exists. Until then, `docs/DOCKER-IMAGE-CHANGELOG.md` is a consumer-facing surface no documented job owns

## Amendment 2026-08-10 (stage 3's deploy axis is RETIRED — the matrix goes three entry points to two)

The stage-3 amendment above is retained verbatim as history per [DECISION-MANAGEMENT.md](../../DECISION-MANAGEMENT.md): it was ratified (`human-oversight: confirmed`, `oversight-date: 2026-07-27`) and implemented, with six production applies behind it. It is superseded here, not rewritten.

**What changes.** The deploy row of the change-type→action matrix loses its push axis. `release.yml`'s `Detect a deploy/** change in this push` step is deleted and the shared deploy gate narrows from three disjuncts to two:

```
success() && (steps.changesets.outputs.published == 'true' || inputs.deploy_only == true)
```

This is the first change to that row that **removes** an entry point rather than narrowing or widening one. Every prior change to it landed as a dated in-place amendment (stage 2, stage 3, the 2026-07-28 GHCR move, the 2026-08-08 P095 fix); this follows the same form deliberately, because the row is this ADR's normative enumeration of the ways production can change.

**This reverses the answer this ADR gave on 2026-08-08, and the reversal is argued rather than implied.** The reassessment criterion _"the `deploy/**` axis fires an unintended production deploy — reconsider whether it should require the dispatch after all"_ fired on run `31252424980` and was answered here: _"the answer is **no** … it is made safe one layer down."_ **That reasoning is not withdrawn and the P095 remediation did not fail.** The axis retires on an independent ground the 2026-08-08 answer had no way to anticipate: the detection predicate diffed a **path**, and a rename **out of** `deploy/` presents as deletions **under** it, so the commit that moves the tree into `packages/deployment/` would itself have armed a push-tier production apply as a rider on a refactor. Verified by replaying the predicate against a real `git mv`. [ADR 044](044-native-esm-without-a-build-step.proposed.md) hit the same shape and routed around it once by holding a file back; this removes the trap.

**Confirmation (this amendment).**

- [x] `release.yml` contains no `deploy/**` path-detection step, and no expression reads its output
- [x] The shared gate carries exactly two disjuncts, and the gated-step count of **three** (Deploy / Wait / Smoke) is **unchanged** — the count pins steps, not disjuncts, which the stage-3 amendment's looser _"a third disjunct changes both"_ wording got wrong and this amendment corrects
- [x] `test/js/__tests__/release-workflow-deploy-only.test.mjs` asserts the axis cannot silently return, and was verified RED against `release.yml` before the step was removed
- [x] The four assertions that pinned the removed step are removed **with their rationale recorded in place**, not silently deleted — discharging this ADR's standing _"the test is updated, not deleted"_ criterion
- [x] [ADR 001](001-risk-gated-release-process.proposed.md) carries the matching dated amendment withdrawing the push-tier authorisation, with the 2026-07-27 block retained as history
- [x] The mechanical prerequisite this ADR set on itself — no `deploy/**` detection step without an ADR-001 amendment naming it — is now satisfied **vacuously**, and its test assertion has been re-keyed onto the retained history so it cannot pass on the retirement block alone

**What this does NOT do.** It does not establish the successor entry point. Between this amendment and that decision, `deploy_only` is the only route to an infrastructure apply — the _less_-proven of the two, per R020. That interim, its price and its two compensating conditions are recorded in ADR 001's 2026-08-10 amendment rather than duplicated here.

## Amendment 2026-08-08 — the deployed version is the registry's, not the workspace's (P095)

**The reassessment criterion "the `deploy/**` axis fires an unintended production deploy" has FIRED, and this amendment discharges it.** Run 31252424980 deployed a version that was not published, and Elastic Beanstalk failed on both instances. The answer is **no, the axis should not require the dispatch after all** — it is made safe one layer down, at version resolution, which leaves the change-type matrix intact.

**What was never written down.** No decision recorded where `elasticapp_version` came from. It was `$npm_package_version` — the version in the job's working tree — and that was safe only by accident of ordering. `changesets/action` runs `changeset version` in that tree to author the release PR, so on a `deploy/**` push with a release pending the workspace has already moved to an unpublished version and the deploy takes it.

**The three disjuncts were never equivalent.** `published == 'true'` and `deploy_only == true` both guarantee workspace-version equals registry-version. `steps.deploy-paths.outputs.changed == 'true'` says nothing about the version at all. That asymmetry is the defect; the matrix is not.

**Decision.** `deploy/resolve-version.sh` resolves the version once, and `deploy/deploy.sh` uses it at all four sites that must agree — the `elasticapp_version` tfvar (which drives the S3 key _and_ the EB application-version label), the deployment manifest's own `version`, the dependency pin EB installs, and the zip filename `main.tf`'s `source` reads. Resolving fewer than all four would label the environment one version while the bundle installs another, and `aws_s3_object.elasticapp` carried no `etag` or `source_hash` at the time, so `terraform plan` could not see that disagreement (a manifest `source_hash` was added 2026-08-09; the four-site agreement invariant is unaffected — it is what makes the sites agree, not what detects them disagreeing). The silent identity lie would be worse than the loud failure being fixed.

Two paths, deliberately split:

- **Just published on this run** (`ADDRESSR_DEPLOY_JUST_PUBLISHED=1`, set by `release.yml` only when `steps.changesets.outputs.published == 'true'`) — use the workspace version. It _is_ the version just published, correct by construction with no race. A registry read here could return the previous version, because `npm view` is a CDN-served read of the `latest` dist-tag and `npm publish` returning does not guarantee an edge read reflects it. That would deploy the wrong version green and silent.
- **Otherwise** (`deploy/**` push, `deploy_only` dispatch) — `npm view <pkg> version`. Whatever the registry serves is the only thing EB can actually install.

Omitting the signal falls back to the registry, so a caller that forgets it fails in the safe direction. Resolution fails closed: an empty or failed read aborts the deploy rather than writing a manifest pinning an unusable version. `deploy.sh` is `#!/bin/sh` with no `set -e`, so this is explicit rather than inherited from `${var:?}`.

**Consequence worth recording:** this also retires `terraform-plan.yml`'s documented caveat that dispatching while `package.json` differs from the deployed version shows EB churn which is an artefact of timing rather than of the change. Plan and apply now resolve the same way.

**Confirmation:** `test/js/__tests__/deploy-version-resolution.test.mjs` runs the resolver against a stub registry and runs `deploy.sh` against stub `terraform`/`zip` to read what it actually wrote. Mutation-proved: reverting either the tfvar or the zip filename to the workspace version fails the four-site assertion.

**Gate untouched.** The three disjuncts and the occurrence count of 3 are unchanged, so this amendment does not disturb the existing Confirmation criteria.
