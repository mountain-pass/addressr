# Risk R025: Deploy Axis Armed Jtbd400 Manual Deploy Path Unexercised

**Status**: Retired (2026-08-04 — merged into R020)
**Category**: <!-- pending review — auto-scaffolded from pipeline hint -->
**Identified**: 2026-07-27
**Owner**: pending review
**Last reviewed**: 2026-08-04
**Next review**: n/a (retired)
**Curation**: curated at retirement 2026-08-04

## Description

Push-tier deploy/** axis wired live while JTBD-400 manual --deploy-only path never exercised; deferral lifted not satisfied (R020/R021)

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

- 2026-07-27T12:39:30Z: fired in `.risk-reports/2026-07-27T12-39-30-commit.md` (reason: user-stated-precondition)

## Change Log

- 2026-07-27: Auto-scaffolded by Phase 2b drain (ADR-056). Pending human curation.

## Retirement

Merged into **R020** on 2026-08-04. The two entries described one hazard — the `deploy/**` push-tier axis armed while JTBD-400's manual `--deploy-only` precondition is unmet — and this one named R020 in its own description, so the duplication was self-declared and then outlived the curation that would have caught it. Same shape as R011/R016 merging into R004 earlier in the same drain.

Scoring lives on R020, which carries the measured split: the axis half is **discharged** (three successful production applies, each verified by reading the `Deploy new version` step's conclusion) while the recovery half is **not** (all four `workflow_dispatch` runs skipped every deploy step, so `deploy_only=true` has never been dispatched). R020 holds the residual at **8/25, above appetite**, with a one-action treatment: dispatch it once.

Do not re-open this entry. Add evidence to R020.
