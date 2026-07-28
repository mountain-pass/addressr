---
human-oversight: confirmed
oversight-date: 2026-07-28
status: validated
job-id: obtain-and-run-published-image
persona: self-hosted-operator
date-created: 2026-07-28
screens:
  - README.md (Self Hosted with Docker)
  - docs/DOCKER-IMAGE-CHANGELOG.md
  - Dockerfile
  - .dockerignore.tmpl
---

# JTBD-202: Obtain and run the published Docker image

## Job Statement

When I self-host Addressr from the published container image, I want a single, discoverable place to pull it from and a clear tag to run, so I can stand up the API server and the data loader without guessing at a registry or a version.

When the image changes without a new npm release, I want a changelog keyed by image tag, so I can tell what moved in `:latest` and decide whether to pin an immutable tag instead.

When the project moves where the image is published, I want the move recorded as a breaking change with the new pull command, so I am not left pulling a stale image from an abandoned registry indefinitely.

## Desired Outcomes

- The published image is pullable anonymously (no login) from `ghcr.io/mountain-pass/addressr` — a public GitHub Container Registry package.
- `:latest` names the newest build; an immutable `:<version>-<gitsha>` tag is available to pin a build that can never be re-pointed.
- The data loader and the server are both runnable from the same image, with the loader's writable-`target` mount requirement documented (the server can run `--read-only`, the loader cannot).
- Image-only changes (independent of npm releases) are traceable via `docs/DOCKER-IMAGE-CHANGELOG.md`, keyed by image tag.
- A registry move is announced as a breaking change with the new pull command, so operators on the old registry know to switch.

## Persona Constraints

- **Self-Hosted Operator** (primary): pulls and runs the image; does not build from source. Expects a public, anonymously-pullable registry and a stable pull command.

## Current Solutions

- The former Docker Hub image `mountainpass/addressr`, published by hand and now frozen — operators pinning it receive no further updates.
- Building locally from the npm tarball via `npm run build:docker` — works without git, but requires a toolchain the pull-and-run operator does not want.

## Related

- ADR 039 (Distroless Docker runtime) — the image identity and runtime shape this job consumes.
- ADR 040 (Release-pipeline change-type→action matrix) — the docker axis + tag contract; amended to publish to `ghcr.io/mountain-pass/addressr` via `GITHUB_TOKEN`.
- P055 (Migrate Docker image Alpine→Distroless) — parked the operator tag-contract ownership gap this job now owns.
