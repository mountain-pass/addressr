---
human-oversight: confirmed
oversight-date: 2026-07-27
status: 'proposed'
date: 2026-07-26
decision-makers: [Tom Howard]
consulted: []
informed: []
supersedes: [013-docker-image]
reassessment-date: 2027-01-26
---

# ADR 039: Distroless Runtime for the Published Docker Image

> **Oversight note.** The substance of this decision — Distroless over Alpine, shell-loss accepted — was taken by the user on 2026-07-18 during the `/wr-architect:review-decisions` drain and is recorded on [P055](../problems/known-error/055-migrate-docker-image-alpine-to-distroless.md). This ADR was authored by an AFK iteration with no interactive access, so it carries `human-oversight: unconfirmed` for the drain to promote rather than self-certifying against that provenance. [ADR 040](040-release-pipeline-change-type-action-matrix.proposed.md) is in the same state and amends this ADR in three places; **ratify both in the same drain pass**, and do not let ADR 040 reach `accepted` first.

## Amendment 2026-07-26 (tini init) — the dropped-`dumb-init` reasoning was wrong

**This ADR asserted something false, and CI caught it.** The Decision Outcome claimed `dumb-init` could go because "node installs default `SIGTERM`/`SIGINT` handlers on POSIX, so the kernel's PID-1 signal-ignore rule does not apply". It does apply. The kernel gives PID 1 no default signal dispositions at all, and node installs no explicit `SIGTERM` handler of its own, so node running as PID 1 discards `SIGTERM`. The `build-and-smoke` job's stop-timing assertion failed exactly as designed: the container took 11s and was `SIGKILL`ed at Docker's 10s grace deadline.

The remedy is the one this ADR pre-authorised and the one its own reassessment criterion names. A `tini` init now runs as PID 1 and forwards `SIGTERM` to node, which as a child _does_ carry the default disposition and exits. The Distroless substance is untouched: same base image, same uid 65532, same resolved `CMD` path, same `WORKDIR`, same env defaults, same two-stage build. One binary is added; nothing is reversed. This is an amendment, not a supersession.

**ADR 013 was right about this, and this ADR was wrong to discard it.** [ADR 013](013-docker-image.superseded.md) is filed in the compendium as direction for what _not_ to do, on its base-image pick. Its signal-handling driver was correct, and the `dumb-init` it carried was doing real work. Do not read its superseded status as covering that driver.

**Considered alternatives.**

1. **An app-level `process.on('SIGTERM')` handler only.** Genuinely viable, not unavailable: an _explicitly installed_ handler is honoured for PID 1, and only the _default_ disposition is suppressed. Declined as the sole fix for two reasons. It is a `src/` change, so under [ADR 040](040-release-pipeline-change-type-action-matrix.proposed.md) it is an npm package release for a defect that lives entirely on the docker axis. And it leaves PID 1 with no zombie reaping and makes correct container termination contingent on application code staying correct.
2. **`docker run --init`.** Rejected: it relocates the fix into the operator's run command, so the published image stays broken by default.
3. **A statically linked upstream `tini` release binary.** Rejected on supply-chain grounds: an unpackaged download with a hand-maintained checksum is a worse input than a Debian-signed package. Debian's `tini` is glibc-linked rather than static, which is safe here for precisely this ADR's own stated reason for the bookworm build stage — build and runtime share a Debian 12 libc, and `distroless/nodejs22-debian12` necessarily ships glibc because node links against it.
4. **`tini` in the image, chosen.** Fixes the defect on the docker axis with no npm release, and gives a correct PID 1 that does not depend on application code.

This is `tini` now **plus** the graceful-shutdown handler later, not `tini` instead of it. Option 1 remains wanted for a different property — draining in-flight requests — and is tracked as [P067](../problems/verifying/067-no-sigterm-graceful-shutdown-handler.md). It is deferred, not dropped.

**Acquisition is unpinned, deliberately and consistently.** `apt-get install -y --no-install-recommends tini` names no version. That is the same float-over-stale-pin position this ADR already takes on the `:nonroot` base tag, extended to `tini` rather than left implicit. It is also a third instance of an inherited gap: [ADR 011](011-license-compliance-precommit.accepted.md)'s license gate and [ADR 015](015-dry-aged-deps.accepted.md)'s freshness checking are both npm-scoped, so neither the base image nor `tini` is covered by any automated control. `tini` is MIT, compliant on the allowlist, and verified by nobody but a human reading this sentence.

**What this does not change:** ADR 040 stage 2 has not landed, so a `Dockerfile` push builds and smoke-tests but does not publish. The fixed image reaches Docker Hub only via stage 2 or a break-glass `npm run docker:push`. Do not read a green CI run as "the fix shipped".

## Amendment 2026-07-26 (ADR 040)

[ADR 040](040-release-pipeline-change-type-action-matrix.proposed.md) decouples the release pipeline into independent npm / docker / deploy axes. Three parts of this ADR change as a result. The Distroless substance — multi-stage build, uid 65532, resolved `CMD` path, `WORKDIR /home/nonroot`, re-declared env defaults — is untouched.

**1. The tag scheme supersedes this ADR's version-only tagging.** `build:docker` tagged `:${npm_package_version}` and `:latest`. It now writes an immutable `:<version>-<gitsha>` plus `:latest` on every build, and the bare `:<semver>` only on a package release, so a Docker-only rebuild can never re-point a tag a self-hoster has already pinned. The `-<gitsha>` suffix degrades away when `git rev-parse` cannot answer, which preserves the driver that `npm run build:docker` keeps working unmodified for someone building from the npm tarball. ADR 040 records a known flaw in the chosen form: `X.Y.Z-<sha>` is a semver _pre-release_ of `X.Y.Z` and sorts before it, while naming newer code. The form is user-pinned; ADR 040 carries the ordering-preserving alternatives and the trigger to revisit them.

**2. The build-only scope note is closed.** The Decision Outcome recorded that the `Docker Image` workflow "does not push; publishing stays the manual `npm run docker:push`", and the Reassessment Criteria treated promoting it to a publisher as a separate decision. ADR 040 is that decision: publishing moves into CI behind GitHub Actions secrets `DOCKER_ID_USER` / `DOCKER_ID_PASS`, guarded both by an explicit `push` input (false for the pull-request caller) and by a non-empty-secret check, so it no-ops cleanly before the secrets exist. The manual scripts survive as documented break-glass, with the bare-semver tag opt-in behind `DOCKER_PUBLISH_SEMVER=1` so a local push cannot re-point a consumer pin either.

> **Correction 2026-07-26 (ADR 040 stage 2, as built).** Point 2 above describes a topology that was not built. There is no `push` input and no separate reusable definition: build, smoke, and publish stay in `.github/workflows/docker-image.yml` job `build-and-smoke`, and the pull-request guard is an inline `if:` on the publish step rather than an input passed by a caller. See the [ADR 040 stage-2 amendment](040-release-pipeline-change-type-action-matrix.proposed.md) for why. Two knock-on corrections. Point 2's guard description holds in substance — the inline `if:` blocks a same-repo pull request exactly as `push: false` would have — only its mechanism is wrong. And the Confirmation note below that this ADR's criteria "transfer unchanged" to a reusable definition when stage 2 creates it is now moot in the simplest possible way: nothing was created, so the criteria stay pointed at `docker-image.yml` job `build-and-smoke`, where they already sit and already pass. The compensating control this ADR leans on for declining the digest pin — the exact image is smoke-tested before it is pushed — is strengthened rather than weakened by the same-job shape, because there is no second build for the pushed digest to diverge from.

## Amendment 2026-07-28 (registry moved to GHCR)

The published image's identity changes from Docker Hub `mountainpass/addressr` to **`ghcr.io/mountain-pass/addressr`** (GitHub Container Registry), authenticated in CI by the built-in `GITHUB_TOKEN`. The full rationale, credential-handling change, and confirmation criteria live in the [ADR 040 2026-07-28 amendment](040-release-pipeline-change-type-action-matrix.proposed.md), which discharges its own "Docker Hub is replaced by another registry" reassessment trigger. Recorded here only for the parts this ADR owns:

- **Image identity.** Every forward-looking reference to the published image is now `ghcr.io/mountain-pass/addressr`. The historical narrative above — what [ADR 013](013-docker-image.superseded.md) shipped to Docker Hub, and the pre-`tini` state CI caught — is left unchanged; it describes the superseded past accurately and must stay that way.
- **Distroless substance is untouched.** Same base images, uid 65532, resolved `CMD` path, `WORKDIR /home/nonroot`, re-declared env, `tini` as PID 1. The registry move is an identity/credential change only; not one runtime property of the image changes.
- **Namespace asymmetry is intentional.** The npm scope stays `@mountainpass` (no hyphen); the GHCR namespace is `mountain-pass` (hyphenated GitHub org login). Different registries, different identifiers — do not reconcile them.

**3. The digest-pin reassessment trigger fired, was assessed, and the pin is declined.** The image-publishing-moves-into-CI trigger has now fired. It is discharged rather than left to re-fire — see the rewritten Reassessment Criteria entry below, and the reasoning under the floating-`:nonroot` consequence.

## Context and Problem Statement

[ADR 013](013-docker-image.superseded.md) shipped the `mountainpass/addressr` image as a single-stage `node:22-alpine` build with `dumb-init` as PID 1, installing addressr globally under the `node` user. That image carries a full userland: a shell, a package manager, `npm`, and the coreutils Alpine ships by default. None of it is needed to run an Express server, and all of it is CVE surface on an image published to Docker Hub for anyone to pull.

Addressr is a revenue-generating public API, so the published artefact is a supply-chain surface rather than a convenience. The user took the decision to move to Distroless on 2026-07-18, which is why ADR 013 has been carrying `human-oversight: rejected-pending-supersede` against P055 since then. This ADR records the resulting design.

## Decision Drivers

- Minimise the attack surface of a publicly pullable image (no shell, no package manager, no npm at runtime)
- Preserve the runtime contract self-hosters already depend on: same env vars, same server, same defaults
- Preserve non-root execution, which was a first-class ADR 013 driver
- Preserve correct signal handling. **Amended 2026-07-26:** this driver survived; the mechanism chosen to satisfy it did not. The original wording read "now that `dumb-init` is gone", on reasoning that turned out to be false. An init is still required as PID 1; it is now `tini` rather than `dumb-init`
- Do not require a self-hoster to change how they build the image (`npm run build:docker` must keep working unmodified)

## Considered Options

1. **Multi-stage build with a Distroless runtime stage** — build on a full Node image, copy the installed package into `gcr.io/distroless/nodejs22-debian12:nonroot`
2. **Stay on Alpine and harden it** — drop the package manager, prune the shell, keep `dumb-init`
3. **Distroless `base` or `static` with a bundled Node** — vendor the Node runtime rather than using the Distroless Node image

Option 2 keeps a shell around for debugging but leaves most of the userland in place; the hardening is manual and rots. Option 3 buys nothing over the Distroless Node image and makes the project responsible for tracking Node patch releases itself.

**Amended 2026-07-26:** Option 3's rejection should not be read as a commitment to zero vendored binaries in the runtime stage. The runtime now carries one — a Debian-packaged `tini` — and the reasoning against Option 3 was about owning the _Node runtime's_ patch cadence, not about vendoring as such.

## Decision Outcome

**Option 1: multi-stage build with a Distroless runtime stage.**

- Build stage: `node:22-bookworm-slim`, running `npm install --prefer-offline --no-audit -g --prefix /opt/addressr` against the packed tarball. Bookworm rather than Alpine so the build and runtime stages share a libc. **Amended 2026-07-26 — this parity is now load-bearing in the present tense.** It was originally recorded as anticipatory, on the grounds that "the runtime dependency tree is pure JavaScript today". It is not any more: the runtime stage carries a glibc-linked `tini` copied out of the build stage. Swapping `BUILD_IMAGE` to an Alpine variant for speed or size would ship a musl-linked PID 1 that the Debian 12 runtime cannot exec, in an image with no shell to diagnose it. `build-and-smoke` would catch it, but this ADR should not be the thing that invited it.
- Runtime stage: `gcr.io/distroless/nodejs22-debian12:nonroot`, which supplies uid 65532 and an `ENTRYPOINT` of `["/nodejs/bin/node"]`.
- **An init is required as PID 1.** `dumb-init` is replaced by `tini`, not dropped. This bullet originally said `dumb-init` was unnecessary because "node installs default `SIGTERM`/`SIGINT` handlers on POSIX, so the kernel's PID-1 signal-ignore rule does not apply". That was false and CI proved it — see the tini amendment above. The build stage installs `tini` from Debian, the runtime stage takes `COPY --from=build /usr/bin/tini /tini`, and `ENTRYPOINT` is `["/tini", "--", "/nodejs/bin/node"]`. Single deterministic source path, so the build hard-fails if Debian ever stops shipping it. `tini` needs no privilege, so uid 65532 is unchanged.
- `CMD` is the resolved script path (`/opt/addressr/lib/node_modules/@mountainpass/addressr/lib/bin/addressr-server-2.js`) rather than the `addressr-server-2` bin shim, because the shim is `#!/usr/bin/env node` and Distroless has neither a shell nor `/usr/bin/env`.
- `WORKDIR` is `/home/nonroot`, preserving the writable-home semantics the Alpine image had at `/home/node`. The loader writes cwd-relative paths (`target/gnaf` via `GNAF_DIR`, and `target/keyv-file.msgpack`, which has no env override), so cwd must stay writable.
- The four `ELASTIC_*` and four `ADDRESSR_INDEX_*` defaults are re-declared in the runtime stage. `ENV` does not cross stages, and a self-hoster running with zero configuration must see the same defaults as before.
- A `Docker Image` CI workflow (`.github/workflows/docker-image.yml`) builds the image and smoke-tests the container. It does not push; publishing stays the manual `npm run docker:push`. **Amended 2026-07-26:** ADR 040 promotes it to a publisher. ~~The build and smoke steps move into a reusable `workflow_call` definition invoked by both the release path (pushing) and the pull-request path (not pushing), so the two cannot diverge.~~ **Corrected 2026-07-27 against what was actually built** (ADR 040 stage-3 amendment, point 12): nothing moved. `docker-image.yml` **is** the definition and gained `workflow_call` in place, with a `publish_semver` input rather than a `push` one. And it is not invoked by both paths — `release.yml` calls it via `workflow_call` on the release path, while the pull-request path fires through `docker-image.yml`'s own `on.pull_request` trigger. There is still exactly one place that builds, which is the anti-divergence property this bullet was reaching for.

### Consequences

- Good: no shell, no package manager, no npm in the published runtime — the CVE surface is the Node runtime, the application's own dependency tree, and one vendored binary. **Amended 2026-07-26:** this originally read "and nothing else", which stopped being true when `tini` was copied into the runtime stage. `tini` is a single small Debian-packaged init and the claim it displaces was about a whole userland, so the shape of the win is unchanged — but the ADR should not assert a zero it no longer has
- Good: non-root execution preserved, now at uid 65532 via the `:nonroot` tag rather than a `USER` directive the image could be run without
- Good: the ADR 013 open gap ("no Docker-build CI workflow exists") is closed. The image is now built and booted on every push touching the Dockerfile, instead of only when a human remembers to run `npm run build:docker`
- Good: `npm run build:docker` is unchanged. The four build args it passes (`PACKAGE_TGZ`, `PACKAGE`, `VERSION`, `MAINTAINER`) are all still declared. **Amended 2026-07-26:** ADR 040 changes which tags it writes (`:<version>-<gitsha>` plus `:latest`, bare `:<semver>` release-only), not how it builds. The build args are untouched, and the `-<gitsha>` suffix degrades away outside a git checkout, so a tarball consumer still runs it unmodified
- Bad: **no in-container shell.** `docker exec ... sh` no longer works. Diagnosis is `docker logs`, `docker inspect`, `docker cp`, and the `/health` and `/debug/*` endpoints. The user accepted this trade-off explicitly on 2026-07-18
- Bad: **the loader invocation changes.** The old image put both bins on `PATH`, so `docker run mountainpass/addressr addressr-loader` worked. With `ENTRYPOINT` fixed to node and no `PATH` shim, the loader is reached by its absolute script path instead. The capability survives; the command does not. This is breaking for anyone running the loader from the image
- Bad: the loader now needs `-v "$PWD/target:/home/nonroot/target"` for durable storage, and cannot run under `--read-only`. The server still can, and `npm run start:server:docker` still passes `--read-only=true`
- Bad: `:nonroot` is a floating tag with no digest pin, so builds are not byte-reproducible and the base can drift. Accepted deliberately: a pinned digest with no automation to refresh it goes stale and silently reintroduces the CVE surface this ADR exists to remove, which is the worse failure. ADR 015's `dry-aged-deps` freshness checking covers npm dependencies only and does not extend to base-image tags — that gap is inherited, not introduced.

  **Amended 2026-07-26 — re-assessed under ADR 040 and the pin still declined.** Moving publishing into CI was this ADR's own trigger to revisit the pin, on the stated grounds that CI would supply "automation to refresh the pin". That reasoning conflated two different mechanisms. CI supplies _publish_ automation; a pin-refresh mechanism would be a `.github/dependabot.yml` with `package-ecosystem: docker`, and no such config exists in the tree. So the original premise survives intact — a pin with nothing to refresh it still goes stale — but for a reason the trigger did not anticipate.

  The re-assessment also inverts the trigger's assumption. Under CI-as-publisher the image rebuilds far more often, on every change to the Dockerfile, `package.json`, or the lockfile, and each rebuild re-resolves `:nonroot` against upstream. The float is therefore _fresher_ now, not staler, and a frozen digest with no refresh mechanism would be strictly worse than before, holding base-layer patches back across a much higher rebuild cadence. What the float still costs is byte-reproducibility and the possibility that a release publishes an image whose base differs from the last one smoke-tested. Both are tolerable: non-reproducibility is already accepted above, ADR 040's immutable `:<version>-<gitsha>` tag gives per-artefact provenance for whatever was in fact published, and the reusable workflow smoke-tests the exact image before pushing it.

  **Open item:** add base-image digest pinning together with a refresh mechanism. The pin is not the deliverable; the pin plus the refresh is. Until both land together, the float is the safer position

- Bad: the build now has two stages, so a cold build pulls two base images instead of one

- Bad (added 2026-07-26): **`tini` makes the container stop promptly, not gracefully.** Under `["/tini", "--", "/nodejs/bin/node"]` node runs as a child with the _default_ `SIGTERM` disposition, so it dies at once and in-flight requests are dropped. The `< 10s` confirmation criterion will now pass while graceful shutdown remains absent, which is precisely the kind of green-that-means-less-than-it-looks worth naming. Scoped to self-hosters: ADR 040 records that production is an Elastic Beanstalk source bundle, so the docker axis cannot reach it. The remedy is an app-level `process.on('SIGTERM')` wired to the existing `stopServer()`, tracked as [P067](../problems/verifying/067-no-sigterm-graceful-shutdown-handler.md)

### Confirmation

`.github/workflows/docker-image.yml` job `build-and-smoke` is the confirmation mechanism. **None of it has run yet** — the workflow lands in the same session as the Dockerfile and fires on the first push. Until it goes green, this ADR stays `proposed`.

**Amended 2026-07-26 — where these criteria live.** They stay pointed at `docker-image.yml` job `build-and-smoke`, which exists today and is checkable as written. ~~When ADR 040's stage 2 moves the build and smoke steps into the reusable `workflow_call` definition, the criteria transfer there unchanged; that is the handover point.~~ **Corrected 2026-07-27** (ADR 040 stage-3 amendment, point 12): **there is no handover point.** The criteria never moved and never will — `docker-image.yml` job `build-and-smoke` gained `workflow_call` in place and remains their permanent home, whether the run is triggered by its own push/pull-request filters or called from `release.yml`. A reader chasing a future reusable workflow would have been sent to one that does not exist.

- [ ] `npm run build:docker` completes (the workflow's `Build image` step)
- [ ] `docker inspect --format '{{.Config.User}}'` reports a non-root user
- [ ] The container starts and answers a real HTTP request on `/health` — this is the check that catches an unresolvable `CMD` path, since there is no shell to fall back on
- [ ] `docker stop` terminates the container in under 10s, i.e. `SIGTERM` is forwarded by the `tini` init to node rather than the container being SIGKILLed at the deadline. **Amended 2026-07-26:** this criterion originally read "handled without `dumb-init`", and it is the criterion that FAILED — the container took 11s and was SIGKILLed, which is what exposed the false PID-1 reasoning. It is also the narrower of two properties: it proves prompt termination, not in-flight request draining (see the `tini` consequence above and [P067](../problems/verifying/067-no-sigterm-graceful-shutdown-handler.md))
- [ ] Not covered by CI, verify manually before relying on it: the loader runs from the image and writes `/home/nonroot/target/keyv-file.msgpack` without EACCES. The whole `WORKDIR` choice rests on `/home/nonroot` being writable by uid 65532

### Reassessment Criteria

- ~~A native dependency enters the runtime tree — re-check that the bookworm build stage still matches the runtime ABI~~ **Fired 2026-07-26 and discharged.** A glibc-linked `tini` is now in the runtime tree. The parity was re-checked and holds: Debian bookworm builds it against the same libc that `distroless/nodejs22-debian12` ships, which it must, since node itself links against it. Re-arms on the next native addition
- ~~Signal handling regresses in practice (containers SIGKILLed at the stop deadline) — vendor a static init~~ **Fired 2026-07-26 and discharged.** The regression happened exactly as written: `build-and-smoke` SIGKILLed the container at the 10s deadline. An init was vendored — a Debian-packaged `tini` rather than a statically linked upstream binary, for the supply-chain reasoning in the amendment above. Re-arms if a stop-timing failure recurs _with_ `tini` in place, which would indicate something other than PID-1 signal semantics
- In-flight request loss at shutdown becomes concrete for a self-hoster (dropped connections on restart or redeploy) — that is [P067](../problems/verifying/067-no-sigterm-graceful-shutdown-handler.md), the graceful-shutdown handler, not another init change
- Distroless stops publishing a `nodejs22` variant, or Node 22 leaves LTS
- Operator friction from the missing shell becomes concrete — consider publishing a `:debug` tag from the build stage alongside the Distroless one
- ~~Image publishing moves into CI — at that point pin the base image by digest, because there would finally be automation to refresh the pin~~ **Fired 2026-07-26 under ADR 040, assessed, pin declined.** Discharged, not outstanding — see the floating-`:nonroot` consequence for the reasoning. Re-arms only under the two criteria below
- A digest-refresh mechanism lands (a `.github/dependabot.yml` with `package-ecosystem: docker`, or equivalent) — pin the base image by digest at that point, because the precondition the discharged trigger actually needed would then be met
- A build cache is introduced on the docker publish path (buildx layer caching, a cache action, or anything else that stops every build re-pulling) — the float stops being self-refreshing, which is half of why the pin was declined, so re-assess it. Today `build:docker` passes no `--pull` and the workflow uses no cache, so re-resolution happens because hosted runners start cacheless; that is circumstance, not a guarantee
