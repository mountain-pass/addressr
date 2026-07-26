# Risk R017: Distroless Docker Image Unverified No Docker Build Ci

**Status**: Active (auto-scaffolded — pending review)
**Category**: <!-- pending review — auto-scaffolded from pipeline hint -->
**Identified**: 2026-07-26
**Owner**: pending review
**Last reviewed**: 2026-07-26
**Next review**: 2026-07-26
**Curation**: pending review (auto-scaffolded 2026-07-26)

## Description

Published self-hosted Docker image migrated to a multi-stage Distroless runtime with no build, start or smoke verification and no Docker-build CI; commit residual 6/25 above appetite.

> Auto-scaffolded by the Phase 2b drain (ADR-056) from a `wr-risk-scorer:pipeline`
> RISK_REGISTER_HINT bullet. The description is the agent's prefill; scoring
> fields below carry the ADR-026 ungrounded-output sentinel until human curation.

## Inherent Risk

Impact × Likelihood _before_ controls.

- **Impact**: not estimated — no prior data
- **Likelihood**: not estimated — no prior data
- **Inherent Score**: not estimated — no prior data
- **Inherent Band**: not estimated — no prior data

## Controls

- pending review — controls to be enumerated during curation.

## Residual Risk

Impact × Likelihood _after_ controls.

- **Impact**: not estimated — no prior data
- **Likelihood**: not estimated — no prior data
- **Residual Score**: not estimated — no prior data
- **Residual Band**: not estimated — no prior data
- **Within appetite?**: pending — scoring not estimated

## Treatment

pending review — treatment decision deferred until scoring is curated.

## Monitoring

- **Trigger to re-assess**: any new pipeline hint with this risk_slug
- **Metrics**: count of `.risk-reports/` entries citing this slug

## Related

- Criteria: `RISK-POLICY.md`
- Realised-as: <!-- link to docs/problems/P<NNN> when known -->
- Treatment ADRs: <!-- link to docs/decisions/ADR-<NNN> when treatment lands -->

## Evidence Log

Auto-populated from `.risk-reports/` via Phase 2b drain.

- 2026-07-26T05:23:23Z: fired in `.risk-reports/2026-07-26T05-23-23-commit.md` (reason: above-appetite-residual)
- 2026-07-26T05:23:23Z: fired in `.risk-reports/2026-07-26T05-23-23-commit.md` (reason: user-stated-precondition)
- 2026-07-26: **Partially discharged.** The `build-and-smoke` job in
  `.github/workflows/docker-image.yml` ran for the first time on master (run `30195417720`). The
  Distroless image **built successfully** and the runtime-user step printed `runtime user: 65532`
  (the Distroless nonroot uid) — the two properties this risk called unverified are now evidenced.
  The job nonetheless went red on a **test-assertion bug, not an image defect**: the assertion
  accepted only `nonroot` and `65532:65532`, while the base sets `Config.User` to the bare uid, so a
  correct image false-negatived. Fixed by widening the exact-string allowlist to a third arm; the
  Dockerfile was not changed.

  **Still unverified**: container start / `/health`, and SIGTERM termination under 10s. The job
  exits at the first failing step and neither remaining step carries `if: always()`, so both were
  skipped. This risk stays Active until a green run exercises them. See
  [P055](../problems/known-error/055-migrate-docker-image-alpine-to-distroless.md).

## Change Log

- 2026-07-26: Auto-scaffolded by Phase 2b drain (ADR-056). Pending human curation.
- 2026-07-26: Evidence log updated with the first `build-and-smoke` run — build and non-root
  verified, boot and SIGTERM still outstanding. No scoring change (fields remain uncurated); the
  risk is narrower than at scaffold time but not yet dischargeable.
