# Problem 055: Migrate the Docker image from Alpine to Distroless (supersedes ADR-013 base-image pick)

**Status**: Known Error
**Reported**: 2026-07-18
**Priority**: 4 (Low) — Impact: 2 (Minor — attack-surface hardening on the public npm/Docker image; no current user-facing defect) × Likelihood: 2 (Unlikely — no active exploit; a standing-risk reduction) — derived at capture
**Origin**: internal
**Effort**: M — derived at capture (multi-stage Dockerfile rework: build layer runs `npm install -g`, runtime layer is `distroless/nodejs22`; verify `docker build` + container start + a smoke request)
**WSJF**: 2.0
**JTBD**: JTBD-200
**Persona**: self-hosted-operator

## Description

ADR-013 chose an Alpine base with dumb-init for the `mountainpass/addressr` Docker image. User decision 2026-07-18 (during the `/wr-architect:review-decisions` oversight drain): move to a Distroless runtime (`gcr.io/distroless/nodejs22`) for a smaller attack surface, since addressr is a revenue-generating public API. Distroless has no shell and a minimal CVE surface. Trade-off accepted: loss of in-container shell debugging.

## Symptoms

- No active defect — this is a standing-risk (attack-surface) reduction on the published Docker image.

## Workaround

Alpine image continues to work; this is a security-posture improvement, not a fix.

## Root Cause Analysis

### Investigation Tasks

- [x] Multi-stage Dockerfile: build layer (npm global install) → `distroless/nodejs22` runtime layer copying the installed package — `d284853`
- [x] Confirm dumb-init is unnecessary (distroless/nodejs uses a proper init / node as PID 1) or vendor a static init if signal handling regresses — dropped, reasoning in ADR-039; the CI SIGTERM assertion is what will confirm it empirically
- [ ] Verify `docker build`, container start, and a smoke request against the running container — **NOT DONE, see Verification below**
- [x] Author the superseding ADR recording the Distroless decision — [ADR-039](../../decisions/039-distroless-docker-runtime.proposed.md), `d86c6cb`

## Fix Authored (2026-07-26) — Not Yet Build-Verified

Two commits on master, unpushed at time of writing:

- `d284853` — `Dockerfile` reworked to a multi-stage build (`node:22-bookworm-slim` build stage → `gcr.io/distroless/nodejs22-debian12:nonroot` runtime stage); `dumb-init` dropped; `CMD` is the resolved script path because Distroless has no shell and no `/usr/bin/env`; `WORKDIR` is `/home/nonroot` so the loader keeps a writable cwd; all eight `ELASTIC_*` / `ADDRESSR_INDEX_*` defaults re-declared in the runtime stage. Also adds `.github/workflows/docker-image.yml` and flips ADR-013 to superseded.
- `d86c6cb` — ADR-039, the compendium entry, a README `Self Hosted with Docker` section, and a patch changeset naming the two consumer-breaking changes.

### Verification (DEFERRED — requires a machine or CI runner with Docker)

**Nothing in this fix has been built or run.** This session had no Docker daemon and was explicitly barred from running any container command; a prior attempt at this ticket stalled for 60 minutes and was killed, almost certainly on a hanging `docker build`. The verification criterion is:

`docker build` succeeds, the container starts, and a smoke request against the running container returns a result.

`.github/workflows/docker-image.yml` job `build-and-smoke` runs exactly that on the first push touching the Dockerfile, plus two assertions the manual criterion did not cover: the runtime user is non-root, and `docker stop` terminates the container in under 10s (which is what actually proves SIGTERM handling survives the loss of `dumb-init`). **The workflow has never executed.** Until it goes green, ADR-039 stays `proposed` and this ticket stays Known Error.

One check the CI job does not cover, verify by hand before relying on the loader: running the loader from the image writes `/home/nonroot/target/keyv-file.msgpack` without EACCES. The `WORKDIR` choice rests on `/home/nonroot` being writable by uid 65532.

## Reconciled with ADR-040 (2026-07-26) — publishes on the Docker axis, not via an npm bump

The patch changeset this fix originally carried (`.changeset/distroless-docker-runtime.md`) has been
**removed**. The reasoning that justified it no longer holds.

That changeset was added for one stated reason: the image tag derived from `${npm_package_version}`,
so without a version bump the next `docker:push` would retag an already-published version with a
materially different image. A tagging deficiency was forcing a version bump, and the bump was in
turn dragging an npm publish and a full production deploy behind it, for a change that alters
nothing in the npm package.

[ADR 040](../../decisions/040-release-pipeline-change-type-action-matrix.proposed.md) fixes the
tagging deficiency directly. Every build now writes an immutable `:<version>-<gitsha>` plus
`:latest`, and the bare `:<semver>` only on a package release, so an image-only rebuild can no
longer collide with a tag a self-hoster has pinned. The Distroless image therefore publishes on the
**docker axis** and needs no npm version bump. Implemented in `52930b1` (`scripts/docker-tags.sh`
plus the `package.json` scripts); the CI publisher itself is a later stage.

The consumer-facing news the changeset carried — no shell, the loader invoked by script path, the
loader needing a writable `target` mount — moved to
[`docs/DOCKER-IMAGE-CHANGELOG.md`](../../DOCKER-IMAGE-CHANGELOG.md), which is keyed by image tag
rather than npm version. It is deliberately not deferred: without it, removing the changeset would
leave a breaking image change with no versioned notice anywhere for an operator tracking `:latest`.

ADR-039 is amended accordingly in `3807e99` (tag scheme, the build-only scope note closed, and the
base-image digest-pin trigger assessed and declined).

### Follow-ups Not Done This Iteration

- **JTBD gap.** The JTBD reviewer returned FAIL on a real gap: no documented job covers running, inspecting, or troubleshooting the self-hosted container, so the accepted shell-loss trade-off has no job to be weighed against. It asked for a new `JTBD-202: Operate and troubleshoot a self-hosted Addressr container` and for `Dockerfile` to be added to a job's `screens:` list. Both are frontmatter edits on `human-oversight: confirmed` artefacts and must go through `/wr-jtbd:confirm-jobs-and-personas`, which this AFK run had no interactive access to. It also noted P055's own `JTBD: JTBD-200` is a poor fit — JTBD-200 is a non-regression constraint here, not the served job — and should re-point at JTBD-202 once it exists.

  **Expanded 2026-07-26 under ADR-040.** The JTBD review of the tag scheme re-derived this same gap independently and added to it. JTBD-202 should also own the **tag contract**: which tag to pin, what `:latest` promises, when a pinned tag can and cannot change, and how an operator learns an image changed. Until it lands, `docs/DOCKER-IMAGE-CHANGELOG.md` is a consumer-facing surface no documented job owns. Separately, JTBD-400's `screens:` omits `package.json`, `Dockerfile`, `.github/workflows/docker-image.yml`, `.dockerignore.tmpl`, and `docs/DOCKER-IMAGE-CHANGELOG.md`, and its Desired Outcomes still assert the `deploy/**` auto-deploy deferral (P039 variant 4b) that the user lifted on 2026-07-26. All of it batches into one interactive `/wr-jtbd:confirm-jobs-and-personas` run.

- **ADR-039 oversight.** Authored `human-oversight: unconfirmed` for the same reason. The substance was decided by the user on 2026-07-18; `/wr-architect:review-decisions` should promote it.
- **ADR-013 composes-with gap — CLOSED, not deferred.** ADR-013 recorded "no Docker-build CI workflow exists" as an open gap, which is why nothing ever caught a Dockerfile regression. `.github/workflows/docker-image.yml` closes it. Publishing stays manual (`npm run docker:push`); promoting CI to a publisher is a separate decision.

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)

## Related

- Supersedes the base-image pick in [ADR-013](../../decisions/013-docker-image.superseded.md) (Alpine + dumb-init), now superseded by [ADR-039](../../decisions/039-distroless-docker-runtime.proposed.md).
- Composed with the noted ADR-013 open gap (no Docker-build CI, image currency depending on manual builds) — closed by `.github/workflows/docker-image.yml` in `d284853`.
