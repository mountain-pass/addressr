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

> **Oversight note.** The substance of this decision — Distroless over Alpine, shell-loss accepted — was taken by the user on 2026-07-18 during the `/wr-architect:review-decisions` drain and is recorded on [P055](../problems/open/055-migrate-docker-image-alpine-to-distroless.md). This ADR was authored by an AFK iteration with no interactive access, so it carries `human-oversight: unconfirmed` for the drain to promote rather than self-certifying against that provenance.

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
- A `Docker Image` CI workflow (`.github/workflows/docker-image.yml`) builds the image and smoke-tests the container. It does not push; publishing stays the manual `npm run docker:push`.

### Consequences

- Good: no shell, no package manager, no npm in the published runtime — the CVE surface is the Node runtime and the application's own dependency tree, and nothing else
- Good: non-root execution preserved, now at uid 65532 via the `:nonroot` tag rather than a `USER` directive the image could be run without
- Good: the ADR 013 open gap ("no Docker-build CI workflow exists") is closed. The image is now built and booted on every push touching the Dockerfile, instead of only when a human remembers to run `npm run build:docker`
- Good: `npm run build:docker` is unchanged. The four build args it passes (`PACKAGE_TGZ`, `PACKAGE`, `VERSION`, `MAINTAINER`) are all still declared
- Bad: **no in-container shell.** `docker exec ... sh` no longer works. Diagnosis is `docker logs`, `docker inspect`, `docker cp`, and the `/health` and `/debug/*` endpoints. The user accepted this trade-off explicitly on 2026-07-18
- Bad: **the loader invocation changes.** The old image put both bins on `PATH`, so `docker run mountainpass/addressr addressr-loader` worked. With `ENTRYPOINT` fixed to node and no `PATH` shim, the loader is reached by its absolute script path instead. The capability survives; the command does not. This is breaking for anyone running the loader from the image
- Bad: the loader now needs `-v "$PWD/target:/home/nonroot/target"` for durable storage, and cannot run under `--read-only`. The server still can, and `npm run start:server:docker` still passes `--read-only=true`
- Bad: `:nonroot` is a floating tag with no digest pin, so builds are not byte-reproducible and the base can drift. Accepted deliberately: a pinned digest with no automation to refresh it goes stale and silently reintroduces the CVE surface this ADR exists to remove, which is the worse failure. ADR 015's `dry-aged-deps` freshness checking covers npm dependencies only and does not extend to base-image tags — that gap is inherited, not introduced
- Bad: the build now has two stages, so a cold build pulls two base images instead of one

### Confirmation

`.github/workflows/docker-image.yml` job `build-and-smoke` is the confirmation mechanism. **None of it has run yet** — the workflow lands in the same session as the Dockerfile and fires on the first push. Until it goes green, this ADR stays `proposed`:

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
- Image publishing moves into CI — at that point pin the base image by digest, because there would finally be automation to refresh the pin
