---
human-oversight: unconfirmed
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

## Amendment 2026-07-26 (ADR 040)

[ADR 040](040-release-pipeline-change-type-action-matrix.proposed.md) decouples the release pipeline into independent npm / docker / deploy axes. Three parts of this ADR change as a result. The Distroless substance — multi-stage build, uid 65532, resolved `CMD` path, `WORKDIR /home/nonroot`, re-declared env defaults — is untouched.

**1. The tag scheme supersedes this ADR's version-only tagging.** `build:docker` tagged `:${npm_package_version}` and `:latest`. It now writes an immutable `:<version>-<gitsha>` plus `:latest` on every build, and the bare `:<semver>` only on a package release, so a Docker-only rebuild can never re-point a tag a self-hoster has already pinned. The `-<gitsha>` suffix degrades away when `git rev-parse` cannot answer, which preserves the driver that `npm run build:docker` keeps working unmodified for someone building from the npm tarball. ADR 040 records a known flaw in the chosen form: `X.Y.Z-<sha>` is a semver _pre-release_ of `X.Y.Z` and sorts before it, while naming newer code. The form is user-pinned; ADR 040 carries the ordering-preserving alternatives and the trigger to revisit them.

**2. The build-only scope note is closed.** The Decision Outcome recorded that the `Docker Image` workflow "does not push; publishing stays the manual `npm run docker:push`", and the Reassessment Criteria treated promoting it to a publisher as a separate decision. ADR 040 is that decision: publishing moves into CI behind GitHub Actions secrets `DOCKER_ID_USER` / `DOCKER_ID_PASS`, guarded both by an explicit `push` input (false for the pull-request caller) and by a non-empty-secret check, so it no-ops cleanly before the secrets exist. The manual scripts survive as documented break-glass, with the bare-semver tag opt-in behind `DOCKER_PUBLISH_SEMVER=1` so a local push cannot re-point a consumer pin either.

**3. The digest-pin reassessment trigger fired, was assessed, and the pin is declined.** The image-publishing-moves-into-CI trigger has now fired. It is discharged rather than left to re-fire — see the rewritten Reassessment Criteria entry below, and the reasoning under the floating-`:nonroot` consequence.

## Context and Problem Statement

[ADR 013](013-docker-image.superseded.md) shipped the `mountainpass/addressr` image as a single-stage `node:22-alpine` build with `dumb-init` as PID 1, installing addressr globally under the `node` user. That image carries a full userland: a shell, a package manager, `npm`, and the coreutils Alpine ships by default. None of it is needed to run an Express server, and all of it is CVE surface on an image published to Docker Hub for anyone to pull.

Addressr is a revenue-generating public API, so the published artefact is a supply-chain surface rather than a convenience. The user took the decision to move to Distroless on 2026-07-18, which is why ADR 013 has been carrying `human-oversight: rejected-pending-supersede` against P055 since then. This ADR records the resulting design.

## Decision Drivers

- Minimise the attack surface of a publicly pullable image (no shell, no package manager, no npm at runtime)
- Preserve the runtime contract self-hosters already depend on: same env vars, same server, same defaults
- Preserve non-root execution, which was a first-class ADR 013 driver
- Preserve correct signal handling now that `dumb-init` is gone
- Do not require a self-hoster to change how they build the image (`npm run build:docker` must keep working unmodified)

## Considered Options

1. **Multi-stage build with a Distroless runtime stage** — build on a full Node image, copy the installed package into `gcr.io/distroless/nodejs22-debian12:nonroot`
2. **Stay on Alpine and harden it** — drop the package manager, prune the shell, keep `dumb-init`
3. **Distroless `base` or `static` with a bundled Node** — vendor the Node runtime rather than using the Distroless Node image

Option 2 keeps a shell around for debugging but leaves most of the userland in place; the hardening is manual and rots. Option 3 buys nothing over the Distroless Node image and makes the project responsible for tracking Node patch releases itself.

## Decision Outcome

**Option 1: multi-stage build with a Distroless runtime stage.**

- Build stage: `node:22-bookworm-slim`, running `npm install --prefer-offline --no-audit -g --prefix /opt/addressr` against the packed tarball. Bookworm rather than Alpine so the build and runtime stages share a libc. The runtime dependency tree is pure JavaScript today, so this is not fixing a present-tense breakage; it is ABI parity so that adding a native dependency later does not silently produce musl-linked artefacts the Debian 12 runtime cannot load.
- Runtime stage: `gcr.io/distroless/nodejs22-debian12:nonroot`, which supplies uid 65532 and an `ENTRYPOINT` of `["/nodejs/bin/node"]`.
- `dumb-init` is dropped. It existed to be PID 1 for signal forwarding and zombie reaping. Under the Distroless entrypoint node itself is PID 1, and node installs default `SIGTERM`/`SIGINT` handlers on POSIX, so the kernel's PID-1 signal-ignore rule does not apply. Nothing in the server spawns a child process, so there is nothing to reap. If signal handling does regress, the fix is a static init in the runtime stage; that is a follow-up, not a preemptive vendoring.
- `CMD` is the resolved script path (`/opt/addressr/lib/node_modules/@mountainpass/addressr/lib/bin/addressr-server-2.js`) rather than the `addressr-server-2` bin shim, because the shim is `#!/usr/bin/env node` and Distroless has neither a shell nor `/usr/bin/env`.
- `WORKDIR` is `/home/nonroot`, preserving the writable-home semantics the Alpine image had at `/home/node`. The loader writes cwd-relative paths (`target/gnaf` via `GNAF_DIR`, and `target/keyv-file.msgpack`, which has no env override), so cwd must stay writable.
- The four `ELASTIC_*` and four `ADDRESSR_INDEX_*` defaults are re-declared in the runtime stage. `ENV` does not cross stages, and a self-hoster running with zero configuration must see the same defaults as before.
- A `Docker Image` CI workflow (`.github/workflows/docker-image.yml`) builds the image and smoke-tests the container. It does not push; publishing stays the manual `npm run docker:push`. **Amended 2026-07-26:** ADR 040 promotes it to a publisher. The build and smoke steps move into a reusable `workflow_call` definition invoked by both the release path (pushing) and the pull-request path (not pushing), so the two cannot diverge.

### Consequences

- Good: no shell, no package manager, no npm in the published runtime — the CVE surface is the Node runtime and the application's own dependency tree, and nothing else
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

### Confirmation

`.github/workflows/docker-image.yml` job `build-and-smoke` is the confirmation mechanism. **None of it has run yet** — the workflow lands in the same session as the Dockerfile and fires on the first push. Until it goes green, this ADR stays `proposed`.

**Amended 2026-07-26 — where these criteria live.** They stay pointed at `docker-image.yml` job `build-and-smoke`, which exists today and is checkable as written. When ADR 040's stage 2 moves the build and smoke steps into the reusable `workflow_call` definition, the criteria transfer there unchanged; that is the handover point. Naming both avoids re-pointing them at a workflow that does not yet exist.

- [ ] `npm run build:docker` completes (the workflow's `Build image` step)
- [ ] `docker inspect --format '{{.Config.User}}'` reports a non-root user
- [ ] The container starts and answers a real HTTP request on `/health` — this is the check that catches an unresolvable `CMD` path, since there is no shell to fall back on
- [ ] `docker stop` terminates the container in under 10s, i.e. SIGTERM is handled without `dumb-init` rather than the container being SIGKILLed at the deadline
- [ ] Not covered by CI, verify manually before relying on it: the loader runs from the image and writes `/home/nonroot/target/keyv-file.msgpack` without EACCES. The whole `WORKDIR` choice rests on `/home/nonroot` being writable by uid 65532

### Reassessment Criteria

- A native dependency enters the runtime tree — re-check that the bookworm build stage still matches the runtime ABI
- Signal handling regresses in practice (containers SIGKILLed at the stop deadline) — vendor a static init
- Distroless stops publishing a `nodejs22` variant, or Node 22 leaves LTS
- Operator friction from the missing shell becomes concrete — consider publishing a `:debug` tag from the build stage alongside the Distroless one
- ~~Image publishing moves into CI — at that point pin the base image by digest, because there would finally be automation to refresh the pin~~ **Fired 2026-07-26 under ADR 040, assessed, pin declined.** Discharged, not outstanding — see the floating-`:nonroot` consequence for the reasoning. Re-arms only under the two criteria below
- A digest-refresh mechanism lands (a `.github/dependabot.yml` with `package-ecosystem: docker`, or equivalent) — pin the base image by digest at that point, because the precondition the discharged trigger actually needed would then be met
- A build cache is introduced on the docker publish path (buildx layer caching, a cache action, or anything else that stops every build re-pulling) — the float stops being self-refreshing, which is half of why the pin was declined, so re-assess it. Today `build:docker` passes no `--pull` and the workflow uses no cache, so re-resolution happens because hosted runners start cacheless; that is circumstance, not a guarantee
