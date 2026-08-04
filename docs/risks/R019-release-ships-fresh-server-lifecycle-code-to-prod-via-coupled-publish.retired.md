# Risk R019: Release Ships Fresh Server Lifecycle Code To Prod Via Coupled Publish

**Status**: Retired (2026-08-05 — merged into R015)
**Category**: <!-- pending review — auto-scaffolded from pipeline hint -->
**Identified**: 2026-07-26
**Owner**: pending review
**Last reviewed**: 2026-08-05
**Next review**: n/a (retired)
**Curation**: pending review (auto-scaffolded 2026-07-26)

## Description

Graceful-shutdown server-lifecycle rewrite reaches prod EB through the R015 npm-publish/prod-deploy coupling; cumulative residual 6/25 above appetite. Dedupes against R015.

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

- 2026-07-26T11:29:11Z: fired in `.risk-reports/2026-07-26T11-29-11-commit.md` (reason: above-appetite-residual)

## Change Log

- 2026-07-26: Auto-scaffolded by Phase 2b drain (ADR-056). Pending human curation.

## Retirement (2026-08-05)

Self-declared duplicate — the entry body already read "Dedupes against R015" — and confirmed by mechanism rather than accepted on the label.

There is one coupling, not two: `.github/workflows/release.yml:358` gates the **Deploy new version** step on `steps.changesets.outputs.published == 'true' || inputs.deploy_only == true || steps.deploy-paths.outputs.changed == 'true'`. The first disjunct is the coupling. The graceful-shutdown server-lifecycle rewrite this entry named was one payload riding it, not a separate hazard.

Folded into [R015](R015-npm-publish-coupled-to-prod-deploy-p039-unresolved.active.md), which owns the coupling itself.
