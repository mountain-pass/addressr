# Risk R011: Read Shadow Soak Traffic Count In Committed Docs

**Status**: Retired (2026-08-04 — merged into R004)
**Category**: <!-- pending review — auto-scaffolded from pipeline hint -->
**Identified**: 2026-07-18
**Owner**: pending review
**Last reviewed**: 2026-08-04
**Next review**: n/a (retired)
**Curation**: curated at retirement 2026-08-04

## Description

A scrubbed production read-shadow traffic figure was re-committed verbatim into docs/BRIEFING.md; committed docs are a standing traffic-volume disclosure surface the gate does not scan.

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

- 2026-07-14T21:31:09Z: fired in `.risk-reports/2026-07-14T21-31-09-commit.md` (reason: confidentiality-disclosure)
- 2026-07-18T03:17:05Z: fired in `.risk-reports/2026-07-18T03-17-05-commit.md` (reason: confidentiality-disclosure)
- 2026-07-25T12:58:55Z: fired in `.risk-reports/2026-07-25T12-58-55-commit.md` (reason: confidentiality-disclosure)

## Change Log

- 2026-07-18: Auto-scaffolded by Phase 2b drain (ADR-056). Pending human curation.

## Retirement

Merged into **R004** (traffic sample counts in public prose) on 2026-08-04. All three entries described the same hazard — absolute traffic figures committed to a public repository — differing only in which instance triggered the scorer hint. This one was a briefing file re-committing a previously-scrubbed read-shadow figure.

Scoring lives on R004, which carries the merged base rate of four instances and holds the residual **above appetite at 9/25** because the file-content surface has no mechanical control. Do not re-open this entry; add instances to R004's count.
