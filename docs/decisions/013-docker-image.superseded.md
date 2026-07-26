---
status: 'superseded'
date: 2020-01-01
superseded-date: 2026-07-26
superseded-by: [039-distroless-docker-runtime]
decision-makers: [Tom Howard]
consulted: []
informed: []
---

# ADR 013: Docker Image with Alpine and dumb-init

> **SUPERSEDED 2026-07-26 by [ADR 039](039-distroless-docker-runtime.proposed.md).** The base-image pick recorded here (Alpine plus dumb-init, global npm install under the `node` user at `/home/node/.npm`) is replaced by a multi-stage build whose runtime stage is `gcr.io/distroless/nodejs22-debian12:nonroot`. The user took that decision on 2026-07-18 during the `/wr-architect:review-decisions` oversight drain and it is tracked by [P055](../problems/open/055-migrate-docker-image-alpine-to-distroless.md); this ADR was carrying `human-oversight: rejected-pending-supersede` until ADR 039 landed. ADR 039 is `proposed`, not `accepted`: the Distroless image has not been built or booted anywhere yet. The `Docker Image` workflow added alongside it (`.github/workflows/docker-image.yml`) closes the no-Docker-build-CI gap this ADR recorded as Open, but has not yet run.
>
> The body below describes the SUPERSEDED ADR 013 decision as originally authored. Do not implement from this document.

## Context and Problem Statement

Self-hosted consumers need a containerized deployment option for addressr.

## Decision Drivers

- Small image size (Alpine base)
- Proper signal handling in containers (PID 1)
- Security (non-root user)
- Easy deployment via Docker Hub

## Considered Options

1. **Alpine-based image with dumb-init** -- minimal footprint, proper signal handling
2. **Debian/Ubuntu-based image** -- larger but more compatible
3. **Distroless** -- minimal attack surface, no shell

## Decision Outcome

**Option 1: Alpine with dumb-init.** Published to Docker Hub as `mountainpass/addressr`. Runs as `node` user, installs package globally via npm.

As of 2026-04-19 (P001), Dockerfile uses `node:22-alpine` and the v2 binary `addressr-server-2` — matches the `engines: ">=22"` constraint and the live AWS API version.

### Consequences

- Good: Small image size
- Good: dumb-init handles zombie processes and signal forwarding
- Good: Non-root execution
- Good: Dockerfile tracks the production Node version and v2 binary (P001 resolved 2026-04-19)
- Bad: Alpine can have compatibility issues with native modules
- Open: No Docker-build CI workflow exists; image is only built by consumers running `docker build` manually. Docker Hub image currency depends on manual builds — separate design question (not in ADR-013 scope).

### Confirmation

- `Dockerfile` exists at project root
- Docker Hub: `mountainpass/addressr`
- `package.json` has `build:docker` and `start:server:docker` scripts
- `Dockerfile` `ARG BASE_IMAGE=node:22-alpine` and `CMD "addressr-server-2"` (2026-04-19)

### Reassessment Criteria

- Alpine compatibility with native dependencies
- Distroless for reduced attack surface
- Docker-build CI workflow — if the image becomes a supported channel rather than a manual-build option
