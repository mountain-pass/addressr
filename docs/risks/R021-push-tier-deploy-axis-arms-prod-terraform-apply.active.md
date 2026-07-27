# Risk R021: Push Tier Deploy Axis Arms Prod Terraform Apply

**Status**: Active (auto-scaffolded — pending review)
**Category**: <!-- pending review — auto-scaffolded from pipeline hint -->
**Identified**: 2026-07-27
**Owner**: pending review
**Last reviewed**: 2026-07-27
**Next review**: 2026-07-27
**Curation**: pending review (auto-scaffolded 2026-07-27)

## Description

The ADR-040 stage-3 deploy/** axis adds a push-tier trigger for a full prod Terraform apply against live EB, OpenSearch and Cloudflare, at lower governance than the other two entry points and with no plan-approval gate or blue/green on that path.

> Auto-scaffolded by the Phase 2b drain (ADR-056) from a `wr-risk-scorer:pipeline`
> RISK_REGISTER_HINT bullet. The description is the agent's prefill; scoring
> fields below carry the ADR-026 ungrounded-output sentinel until human curation.

## Inherent Risk

Impact × Likelihood *before* controls.

- **Impact**: not estimated — no prior data
- **Likelihood**: not estimated — no prior data
- **Inherent Score**: not estimated — no prior data
- **Inherent Band**: not estimated — no prior data

## Controls

- pending review — controls to be enumerated during curation.

## Residual Risk

Impact × Likelihood *after* controls.

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

- 2026-07-27T01:18:00Z: fired in `.risk-reports/2026-07-27T01-18-00-commit.md` (reason: above-appetite-residual)

## Change Log

- 2026-07-27: Auto-scaffolded by Phase 2b drain (ADR-056). Pending human curation.
