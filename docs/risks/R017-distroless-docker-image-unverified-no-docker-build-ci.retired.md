# Risk R017: Distroless Docker Image Unverified No Docker Build Ci

**Status**: Retired (2026-08-05 — the discharge condition stated on the entry has been met)
**Category**: <!-- pending review — auto-scaffolded from pipeline hint -->
**Identified**: 2026-07-26
**Owner**: pending review
**Last reviewed**: 2026-08-05
**Next review**: n/a (retired)
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

- 2026-07-26: **Narrowed again, and this time the image really was defective.** A subsequent
  `build-and-smoke` run got past the corrected non-root assertion and exercised both remaining
  steps. Two corrections to the entry above, in opposite directions:

  - **`/health` is now VERIFIED.** The steps run sequentially with no `if: always()`, so a run
    reaching the SIGTERM step is proof the container started and answered a real HTTP request on
    `/health`. That closes the check this risk called the catcher of an unresolvable `CMD` path.
  - **SIGTERM moves from unverified to verified FAILING — a real image defect, not a test bug.**
    The container took 11s and was SIGKILLed at Docker's 10s grace deadline. This is explicitly
    unlike the prior run, where a correct image false-negatived on a too-narrow assertion. Here the
    assertion was right and the image was wrong.

  Root cause: the kernel applies no default signal dispositions to PID 1, and node installs no
  explicit `SIGTERM` handler, so node running as PID 1 under the Distroless `ENTRYPOINT` discarded
  the signal. The Distroless migration had dropped `dumb-init` on the stated belief that
  node-as-PID-1 handles signals, and
  [ADR-039](../decisions/039-distroless-docker-runtime.proposed.md) asserted that belief in as many
  words. It was false.

  **Treatment applied**: a Debian-packaged `tini` now runs as PID 1 and forwards `SIGTERM` to node
  (`18f0d9b`) — `ENTRYPOINT ["/tini", "--", "/nodejs/bin/node"]`, with `CMD`, the nonroot uid 65532,
  `WORKDIR` and every env default unchanged. ADR-039 is amended in place rather than superseded
  (`d310c4b`); its reassessment criterion "signal handling regresses in practice — vendor a static
  init" fired exactly as written and is discharged. Docker-axis only under ADR-040, so no changeset
  and no release.

  **Still unverified**: nothing has confirmed the fix. This risk stays Active until a
  `build-and-smoke` run goes green end to end with `tini` in place. Note also that the fix restores
  prompt termination and not graceful shutdown — in-flight requests are still dropped, tracked
  separately as [P067](../problems/verifying/067-no-sigterm-graceful-shutdown-handler.md), so a green
  `<10s` assertion should not be read as more than stop latency.

## Change Log

- 2026-07-26: Auto-scaffolded by Phase 2b drain (ADR-056). Pending human curation.
- 2026-07-26: Evidence log updated with the first `build-and-smoke` run — build and non-root
  verified, boot and SIGTERM still outstanding. No scoring change (fields remain uncurated); the
  risk is narrower than at scaffold time but not yet dischargeable.
- 2026-07-26: Evidence log updated again — `/health` verified, SIGTERM verified failing on a real
  image defect (node-as-PID-1 discarding the signal), `tini` init applied as treatment. Three of the
  four CI criteria are now evidenced; the fourth is evidenced negative with an unverified fix
  against it. No scoring change (fields remain uncurated). Still not dischargeable: this risk exists
  because the image was unverified, and a fix nobody has built is not verification.

## Retirement (2026-08-05)

The entry recorded a Distroless runtime shipped with "no build, start or smoke verification and no Docker-build CI". All four now exist in `.github/workflows/docker-image.yml`, which runs on push: **Build image**, **Runtime user is non-root**, **Container starts and serves /health** (a real `curl` against a booted container), and a SIGTERM-forwarding check.

That last step is the load-bearing one and is not theoretical — the workflow comment records it catching the image being SIGKILLed at the 10s deadline on 2026-07-26, which is the defect this entry existed to anticipate.

This discharges ADR-039 Confirmation criteria rather than merely adding a control that happens to cover the risk.
