# Risk R015: Npm Publish Coupled To Prod Deploy P039 Unresolved

**Status**: Active (auto-scaffolded — pending review)
**Category**: <!-- pending review — auto-scaffolded from pipeline hint -->
**Identified**: 2026-07-24
**Owner**: pending review
**Last reviewed**: 2026-07-24
**Next review**: 2026-07-24
**Curation**: pending review (auto-scaffolded 2026-07-24)

## Description

Release may trigger prod SaaS deploy via unresolved P039 coupling; releasing the changeset could unintentionally deploy the CORS/middleware-ordering change to the live RapidAPI origin

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
- Treatment ADRs: [ADR 001 amendment 2026-07-26](../decisions/001-risk-gated-release-process.proposed.md) — publish-free `deploy_only` prod-deploy trigger (P039 Option 4), gated via `npm run release:watch -- --deploy-only`. **Partial treatment**: the coupling is broken for infra and env-var changes, but a shadow-config flip still applies and then fails its own smoke assertion (see the amendment's scope limitation), so this risk stays active until P039's smoke-parameterisation task lands.

## Evidence Log

Auto-populated from `.risk-reports/` via Phase 2b drain.

- 2026-07-24T14:05:16Z: fired in `.risk-reports/2026-07-24T14-05-16-commit.md` (reason: user-stated-precondition)
- 2026-07-24T14:36:33Z: fired in `.risk-reports/2026-07-24T14-36-33-commit.md` (reason: above-appetite-residual)
- 2026-07-24T14:36:33Z: fired in `.risk-reports/2026-07-24T14-36-33-commit.md` (reason: user-stated-precondition)
- 2026-07-24T23:34:06Z: fired in `.risk-reports/2026-07-24T23-34-06-commit.md` (reason: above-appetite-residual)

## Change Log

- 2026-07-24: Auto-scaffolded by Phase 2b drain (ADR-056). Pending human curation.
