# Problem 055: Migrate the Docker image from Alpine to Distroless (supersedes ADR-013 base-image pick)

**Status**: Open
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

- [ ] Multi-stage Dockerfile: build layer (npm global install) → `distroless/nodejs22` runtime layer copying the installed package
- [ ] Confirm dumb-init is unnecessary (distroless/nodejs uses a proper init / node as PID 1) or vendor a static init if signal handling regresses
- [ ] Verify `docker build`, container start, and a smoke request against the running container
- [ ] Author the superseding ADR (or amend ADR-013) recording the Distroless decision once shipped

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)

## Related

- Supersedes the base-image pick in [ADR-013](../../decisions/013-docker-image.accepted.md) (Alpine + dumb-init). ADR-013 marked `rejected-pending-supersede` against this ticket during the 2026-07-18 review-decisions drain.
- Composes with the noted ADR-013 open gap: no Docker-build CI (image currency depends on manual builds).
