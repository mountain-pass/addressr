---
human-oversight: unconfirmed
status: 'proposed'
date: 2026-07-26
decision-makers: [Tom Howard]
consulted: []
informed: []
reassessment-date: 2027-01-26
---

# ADR 040: Release Pipeline Decoupled into a Change-Type to Action Matrix

> **Oversight note.** The substance of this decision — three independent axes, the SHA-based tag scheme, CI as the Docker publisher, and auto-deploy on a `deploy/**` change — was taken by the user on 2026-07-26. This ADR was authored by an AFK iteration with no interactive access, so it is born `human-oversight: unconfirmed` for the `/wr-architect:review-decisions` drain to promote rather than self-certifying. The architect review noted that the substance is user-pinned and the marker could reasonably be born `confirmed`; the drain should be able to promote it quickly. [ADR 039](039-distroless-docker-runtime.proposed.md) is in the same state and **must be ratified in the same pass** — this ADR amends it in three places, and stage 2 must not land ahead of that drain.

## Context and Problem Statement

The pipeline has one trigger and three effects welded to it. A merged changesets release PR publishes to npm, and the same job then deploys to production. The Docker image is outside CI entirely — a human runs `npm run build:docker` and `npm run docker:push` from a laptop.

The consequence is that the _only_ way to make anything happen is to bump the npm version. [P039](../problems/known-error/039-decouple-saas-deployment-from-npm-publish.md) recorded the two symptoms: a long run of commits carrying a changeset while touching zero files that ship in the npm tarball, purely to move an infra change to prod; and a `CHANGELOG.md` that conflates three audiences, telling an npm consumer about a Terraform edit that cannot affect them.

[P055](../problems/known-error/055-migrate-docker-image-alpine-to-distroless.md) is the same coupling seen from the Docker side. The Distroless rebuild changes nothing in the npm package — its own changeset says so in as many words — but it was given a patch changeset anyway, for one reason recorded honestly at the time: the image tag derives from `${npm_package_version}`, so without a version bump the next `docker:push` would retag an already-published version with a materially different image. A tagging deficiency was forcing a version bump, and the version bump was in turn dragging an npm publish and a production deploy along behind it.

[ADR 001](001-risk-gated-release-process.proposed.md)'s 2026-07-26 amendment cut the first strand by adding a publish-free `--deploy-only` dispatch. This ADR generalises that from one escape hatch into a matrix.

## Decision Drivers

- A change should trigger the actions it actually implies, and no others
- No axis may be reachable only by laundering the change through an unrelated axis
- Publishing an image must never silently re-point a tag a self-hoster has already pinned
- One definition per action, invoked from every path that needs it, so two paths cannot drift apart
- The change must not be able to red master before the user adds the Docker Hub secrets
- Whatever governs a production deploy today must keep governing it

## Considered Options

1. **A change-type to action matrix with npm, docker, and deploy as independent axes**
2. **Keep the coupling and add more escape hatches** — a second dispatch input for docker, alongside `deploy_only`
3. **Split into three separate workflow files, one per axis**

Option 2 is the status quo's trajectory. Each hatch is cheap on its own and the set of them is a pipeline nobody can reason about; it also leaves the default path — a plain push — still doing the wrong thing. Option 3 gets the independence but loses the single-definition property: the deploy steps would exist in two files, and [ADR 001](001-risk-gated-release-process.proposed.md) already forbids that specific divergence for the deploy axis. It also cannot express the double-publish guard, for the reason set out under Decision Outcome.

## Decision Outcome

**Option 1: a change-type to action matrix, npm / docker / deploy as three independent axes.**

### The detection matrix

| Axis           | Fires when                                                                                                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm publish    | A changeset is consumed — `steps.changesets.outputs.published == 'true'`                                                                                                                      |
| docker publish | `published == 'true'` **OR** (a push to `master` touched `Dockerfile`, `.dockerignore.tmpl`, `package.json`, `package-lock.json`, or the docker workflow files **AND** `published != 'true'`) |
| deploy         | `published == 'true'` **OR** the `deploy_only` dispatch input **OR** a push to `master` touched `deploy/**`                                                                                   |

The `&& published != 'true'` conjunct on the docker axis is the double-publish guard. A changesets release commit also touches `package.json`, so without it a release would satisfy both docker disjuncts and publish the image twice.

That guard is why the docker publish path lives **in `release.yml`**. `published` is an output of a step inside that workflow's `release` job; a separate workflow file triggered by the same push cannot read it, so the guard would be unimplementable across a workflow boundary. The `release` job therefore gains a declared job-level output exposing `steps.changesets.outputs.published`, and the docker publish job runs with `needs: release`.

**Path detection is a plain `git diff --name-only` shell step, scoped to `github.event_name == 'push'`** — not a third-party filter action. Two reasons, both load-bearing. The job holds `DOCKER_ID_PASS`, so a marketplace action there would be registry-credential supply-chain surface. And the event scoping closes a silent-green trap: on a `deploy_only` dispatch the changesets step is skipped, so the job-level output resolves to the **empty string**, not `'false'`, which makes `published != 'true'` evaluate true. The second disjunct then rests entirely on path detection yielding nothing on a non-push event, so that must be explicit rather than incidental. This is the same class as the boolean-coercion trap already documented at `release.yml:18-24`.

### Topology — one definition per action

- **Deploy** keeps a single set of steps in `release.yml`, `if:`-widened to the three disjuncts above. Never forked into a second job, per [ADR 001](001-risk-gated-release-process.proposed.md).
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

### CI as the publisher

Docker Hub credentials move to GitHub Actions secrets `DOCKER_ID_USER` / `DOCKER_ID_PASS`. The publish step is guarded twice, independently:

1. The reusable workflow only pushes when its `push` input is true — the pull-request caller passes false. This matters because on a same-repo pull request the secrets _are_ available, so secret-presence alone would let a PR build publish.
2. The publish step additionally requires the secrets to be non-empty, and no-ops cleanly when they are absent. The wiring can therefore land before the user adds them without turning master red.

`predocker:push` / `docker:push` / `postdocker:push` are **retained as documented break-glass**, not removed. Under the new tag scheme a local `npm run docker:push` no longer re-points an existing `:<semver>` pin, because the bare-semver tag is opt-in behind `DOCKER_PUBLISH_SEMVER=1`. Because these are npm lifecycle hooks that run regardless of what the main script decides, the guard lives inside each script body rather than in `docker:push` alone.

`start:server:docker` is re-pointed from the bare `:${npm_package_version}` to `:latest` in the same change. It resolves correctly today; the re-point is **hardening a forward invariant**, not repairing a defect — it is the only local consumer of the bare tag, and it would stop resolving once the bare tag becomes release-only. The invariant is pinned in Confirmation.

### The docker axis's news obligation

`docs/DOCKER-IMAGE-CHANGELOG.md` is the docker axis's consumer-facing news channel: keyed by image tag rather than npm version, appended by whoever lands a consumer-visible image change. It is the docker-axis counterpart to ADR 007's npm-scoped `CHANGELOG.md`, and having one per axis is the audience separation P039 symptom 2 asked for. It exists because `:latest` moves and because a docker-only publish produces no npm version and therefore no `CHANGELOG.md` entry — without it, an operator tracking `:latest` receives a breaking change with no versioned notice anywhere.

### The `deploy/**` axis, and what governs it

This axis is [P039](../problems/known-error/039-decouple-saas-deployment-from-npm-publish.md) variant 4b. [JTBD-400](../jtbd/addressr-maintainer/JTBD-400-ship-releases-reliably-from-trunk.validated.md) records it as **deliberately deferred until the manual `--deploy-only` path has been exercised a few times**. That precondition is **not met** — `--deploy-only` landed on 2026-07-26 and has been dispatched zero times. The user lifted the deferral on 2026-07-26 regardless. Recording it plainly rather than quietly satisfying the precondition on paper:

The other two deploy entry points carry a **release-tier** risk score, because the wr-risk-scorer gate matches on the `npm run release:watch` command prefix. A `deploy/**` path push carries only **push-tier** — the git-push gate sees `git push`, not `release:watch`. So this axis reaches a full production Terraform apply at a lower governance tier than either existing entry point, with no human intent and no opt-in. [ADR 001](001-risk-gated-release-process.proposed.md)'s accepted residual does not cover it: that residual is scoped to a _deliberate_ raw dispatch, which is a different class from an always-on automatic trigger.

ADR 001 is not amended here, but not because amending a `confirmed` ADR is off-limits — this repo does exactly that, in ADR 001's own 2026-07-26 block and in ADR 004 the same day. The reason is narrower: an ADR 001 amendment has to describe the trigger **as actually implemented**, and no trigger exists until stage 2. Writing it now would document a mechanism that is not there. So the amendment is a **hard prerequisite on the wiring**, enforced as a greppable predicate in Confirmation below, mirrored onto the P039 ticket for discoverability from the ADR 001 side, and pinned mechanically in the stage-2 test.

### Consequences

- Good: a Docker-only change publishes an image and nothing else; an infra-only change deploys and nothing else; neither needs a version bump. P039 symptoms 1 and 2 are retired at the root rather than worked around
- Good: an existing `mountainpass/addressr:3.0.2` pin can never be re-pointed by a rebuild. Self-hosters gain a reproducible pin (`:<version>-<gitsha>`) they do not have today
- Good: image publishing stops depending on a human remembering to run it from a laptop with credentials on disk
- Good: one definition for the deploy steps and one for the docker steps, so the release path and the standalone path are the same code by construction
- Bad: **the tag form inverts semver ordering.** `X.Y.Z-<sha>` is a semver _pre-release_ of `X.Y.Z` and sorts **before** it, but `package.json` is not bumped until the release PR merges, so a trunk build tagged `X.Y.Z-<sha>` contains code strictly **newer** than the `X.Y.Z` release build. Renovate, Watchtower, Docker Hub's sort and humans all read the ordering backwards. `:master-<gitsha>` or `:<version>-post-<gitsha>` would preserve ordering. The `:<version>-<gitsha>` form was pinned by the user on 2026-07-26, so it is implemented as directed and the inversion recorded here for the ratification drain to confirm or overturn
- Bad: **`:latest` changes meaning**, from "the latest release" to "the latest trunk build". `prebuild:docker` packs the working tree, and the docker axis fires precisely when `published != 'true'`, so a master push publishes unreleased code and moves `:latest`. This drops the artefact-to-published-npm-version correspondence ADR 013 and ADR 039 established
- Bad: **an operator tracking `:latest` receives changes without asking for them** — which is exactly how the breaking Distroless change (no shell, loader by script path) will reach them. This is why `docs/DOCKER-IMAGE-CHANGELOG.md` exists and why it lands before the docker axis ever publishes
- Bad: **the `deploy/**` axis reaches production at push-tier governance**, as set out above. Mitigated only by the ADR 001 amendment prerequisite, which must land before the trigger is wired
- Bad: **fail-closed coupling.** With `needs: release`, a failing `release` job — including the P044 swallowed-publish assertion — skips the docker publish even for a pure `Dockerfile` change. Not publishing from a red tree is desirable, but it is a behavioural change from today's independent `docker-image.yml`
- Bad: **on the publish path the docker axis is not independent of the deploy axis.** `needs: release` plus GitHub's implicit success requirement puts the docker publish behind the deploy, the 120s wait, and the whole prod smoke block. A red prod smoke after a successful npm publish leaves npm and Docker Hub divergent with no automatic retry. Benign — it degrades to today's manual `npm run docker:push` — but it is real, and it adds publish latency
- Bad: **the docker axis is independent in _what fires_, not in _latency_.** `release` carries `needs: build-and-test`, so a docker-only rebuild queues behind the full two-version OpenSearch matrix (`2.19.5`, `3.5.0`) that the standalone `docker-image.yml` bypasses entirely today
- Bad: `SEARCH_IMAGE*` lives in `package.json`, so an OpenSearch CI pin bump under [ADR 035](035-opensearch-3-5-upgrade-2-19-ci-regression.accepted.md) is a docker-axis trigger. It will publish an image and move `:latest`. Consistent with the matrix by design, recorded here so it is not a surprise
- Bad: two secrets now exist in CI that can push to a public registry. The two independent guards above are what keeps a pull request from reaching it
- Neutral: **prod cannot be reached by the docker axis.** [ADR 004](004-aws-elastic-beanstalk-deployment.accepted.md) runs Elastic Beanstalk on a Node.js 22 / AL2023 **source-bundle** platform, not a container platform. That is the structural fact that makes the docker and deploy axes genuinely independent rather than merely separately triggered
- Neutral: [ADR 010](010-devcontainer-ci-deployment.accepted.md)'s devcontainer requirement is scoped to the deploy step. The docker reusable workflow runs on a plain runner and does not implicate it

### Confirmation

Stage 1 (this ADR, the ADR 039 amendment, the tag scheme in `package.json`, `docs/DOCKER-IMAGE-CHANGELOG.md`, README tag guidance, the P055 reconciliation, the compendium) is complete when the commits land. The axes themselves are confirmed by stages 2 and 3, against these criteria:

- [ ] **Ratification ordering.** ADR 040 does not reach `accepted` ahead of [ADR 039](039-distroless-docker-runtime.proposed.md), and both are ratified in one `/wr-architect:review-decisions` drain. Stage 2 does not land before that drain
- [ ] **Prerequisite, mechanically checkable:** `.github/workflows/release.yml` contains no `deploy/**` path-detection step unless `docs/decisions/001-risk-gated-release-process.proposed.md` contains an amendment block naming the `deploy/**` entry point and its push-tier score. Asserted in `test/js/__tests__/release-workflow-deploy-only.test.mjs`, not left to a human grep
- [ ] `test/js/__tests__/release-workflow-deploy-only.test.mjs` is **updated, not deleted**. It pins the deploy gate as an exact string with an occurrence count of 3; a third disjunct changes both. Its "Known limitation (accepted)" note is revisited in the same change
- [ ] The `release` job declares a job-level output for `steps.changesets.outputs.published`, and the docker publish job reads it via `needs.release.outputs`
- [ ] The path-detection step is scoped `github.event_name == 'push'`, and that scoping is pinned in the stage-2 test — otherwise a `deploy_only` dispatch's empty-string output satisfies `!= 'true'`
- [ ] The docker build/smoke/push steps exist in exactly one file. `grep -c 'docker build'` across `.github/workflows/` returns 1
- [ ] `.github/workflows/docker-image.yml`'s header comment is rewritten. It currently asserts the job does not push, that publishing stays manual, and that the job therefore cannot leak a registry credential — a security claim that stops being true when the `push` input lands
- [ ] `start:server:docker` resolves to a tag `build:docker` produces
- [ ] A push to `master` touching only `Dockerfile` publishes an image and does **not** publish to npm and does **not** deploy
- [ ] A changesets release publishes to npm, publishes the image **once** (not twice), and deploys
- [ ] A push to `master` touching only `deploy/**` deploys and does **not** publish to npm or to Docker Hub
- [ ] With `DOCKER_ID_USER` / `DOCKER_ID_PASS` unset, the publish step skips and the workflow stays green
- [ ] A pull request touching `Dockerfile` builds and smoke-tests the image and does **not** push, with the secrets present
- [ ] `docker manifest inspect mountainpass/addressr:<version>-<gitsha>` resolves after a docker-axis publish, and the bare `:<version>` digest is unchanged by that publish

### Reassessment Criteria

- The `deploy/**` axis fires an unintended production deploy — reconsider whether it should require the dispatch after all, which is the state JTBD-400 currently records
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

- **JTBD-400 is stale on disk.** Its Desired Outcomes still assert the `deploy/**` deferral this ADR lifts. It must be amended to record the lift and the reasoning replacing the "manual path exercised" precondition
- **JTBD-400 `screens:` omits** `package.json`, `Dockerfile`, `.github/workflows/docker-image.yml`, `.dockerignore.tmpl`, and the new `docs/DOCKER-IMAGE-CHANGELOG.md` — all central to this change, and one of which already annotates itself `@jtbd JTBD-400`
- **JTBD-202 does not exist.** P055 already requests `JTBD-202: Operate and troubleshoot a self-hosted Addressr container`. The tag contract belongs in it — which tag to pin, what `:latest` promises, when a pinned tag can and cannot change, and how an operator learns an image changed. P055's own `JTBD: JTBD-200` header re-points at it once it exists. Until then, `docs/DOCKER-IMAGE-CHANGELOG.md` is a consumer-facing surface no documented job owns
