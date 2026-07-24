# Risk R014: Cors Preflight Exempts Options From Proxy Auth Ahead Of Gate

**Status**: Active (auto-scaffolded — pending review)
**Category**: <!-- pending review — auto-scaffolded from pipeline hint -->
**Identified**: 2026-07-24
**Owner**: pending review
**Last reviewed**: 2026-07-24
**Next review**: 2026-07-24
**Curation**: pending review (auto-scaffolded 2026-07-24)

## Description

New app.options 204 handler ordered ahead of proxyAuthMiddleware on the prod API root exempts preflight from gateway auth and emits Max-Age by default; residual 6/25 above appetite until preflight headers are gated behind CORS opt-in

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

- 2026-07-24T14:05:16Z: fired in `.risk-reports/2026-07-24T14-05-16-commit.md` (reason: above-appetite-residual)

## Change Log

- 2026-07-24: Auto-scaffolded by Phase 2b drain (ADR-056). Pending human curation.
