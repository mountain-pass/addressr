# Problem 001: Stale Dockerfile

**Status**: Known Error
**Reported**: 2026-04-04
**Priority**: 6 (Medium) — Impact: Moderate (3) x Likelihood: Unlikely (2)

## Description

The Dockerfile still uses Node 16 and runs the v1 API (`addressr-server`). Production runs Node 22 and the v2 API (`addressr-server-2`). The Dockerfile is unusable for current deployments.

## Symptoms

- `docker build` produces an image running the wrong Node version and wrong API version
- Docker image consumers on Docker Hub get a broken/outdated setup

## Workaround

Production deploys via Elastic Beanstalk, not Docker. Docker image consumers are affected but EB deployment works.

## Impact Assessment

- **Who is affected**: Docker image consumers (npm + Docker distribution channel)
- **Frequency**: Every Docker-based deployment
- **Severity**: Medium — one distribution channel is broken, but primary (RapidAPI/EB) works
- **Analytics**: N/A

## Root Cause Analysis

### Confirmed Root Cause

The Dockerfile was last updated for Node 16 + the v1 API (`addressr-server`), but the project has since moved to Node 22 and v2 API (`addressr-server-2`). Specific divergences:

- `Dockerfile:1` pinned `node:16.3.0-alpine3.13`; `package.json` engines requires `>=22`.
- `Dockerfile:43` ran `CMD "addressr-server"` (v1); `package.json` bin now lists both `addressr-server` and `addressr-server-2`, with v2 being the deployed path.

No Docker-build CI workflow exists, so Docker Hub image currency depends on manual `docker build` by whoever pushes the image. That broader question (should Docker become a first-class published channel with CI?) is out of scope for P001 — see ADR 013 `Reassessment Criteria`.

### Investigation Tasks

- [x] Investigate root cause — Node 16 pinning + v1 binary CMD, per Dockerfile line 1 and line 43.
- [x] Create reproduction test — not added; the Dockerfile produces an image that imports `engines: ">=22"` but runs Node 16, which fails at `postinstall`. A CI build would be the strongest test but is out of scope (no Docker workflow exists).
- [x] Implement fix — `ARG BASE_IMAGE=node:22-alpine` and `CMD "addressr-server-2"`.

## Fix Released

**Date**: 2026-04-19

Minimum-viable Dockerfile update:

- `Dockerfile:1`: `node:16.3.0-alpine3.13` → `node:22-alpine` (matches `engines: ">=22"`).
- `Dockerfile:43`: `CMD "addressr-server"` → `CMD "addressr-server-2"` (matches production v2 path).

Also updated `docs/decisions/013-docker-image.accepted.md` — removed "STATUS: STALE" language from Decision Outcome, refreshed Consequences + Reassessment Criteria to note the new state and the remaining open question (no Docker-build CI workflow).

Intentionally out of scope for this ticket:

- Adding a Docker-build CI workflow (separate design decision — would need its own ADR).
- Publishing images to Docker Hub from CI (depends on workflow above).
- Renaming `ELASTIC_*` env vars to `OPENSEARCH_*` — `client/elasticsearch.js:9-13` still reads `ELASTIC_*`, so renaming in Dockerfile would break the image. Would need a coordinated refactor (separate problem if desired).

**Verification path**: Run `docker build -t addressr-local .` locally to confirm the image builds with Node 22 + addressr-server-2. No CI signal available.

## Related

- BRIEFING.md notes the Dockerfile is stale (now resolved)
- ADR 004: AWS Elastic Beanstalk Deployment (primary channel)
- ADR 013: Docker Image with Alpine and dumb-init (refreshed 2026-04-19)
- Architect review 2026-04-19 — OK TO PROCEED, confirmed `addressr-server-2` exists and ELASTIC\_\* rename is separate scope
