# Risk R013: "Severe but rare, uncontrolled" — a scoring artefact, not a hazard

**Status**: Retired (2026-08-04 — describes a score, not a condition that can occur)
**Category**: n/a (retired — never named a hazard to categorise)
**Identified**: 2026-07-20
**Owner**: addressr-maintainer
**Last reviewed**: 2026-08-04
**Next review**: n/a (retired)
**Curation**: curated at retirement 2026-08-04

## Description

Single staged change scores impact 5 / likelihood 1 = 5/25 Medium with no mitigating control; breaches the Threshold-5 appetite and is standing-risk-shaped until a control is added.

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

- 2026-07-18T09:06:20Z: fired in `.risk-reports/2026-07-18T09-06-20-commit.md` (reason: above-appetite-residual)

## Change Log

- 2026-07-20: Auto-scaffolded by Phase 2b drain (ADR-056). Pending human curation.

## Retirement

**This entry never described a risk.** Read its own description back:

> "Single staged change scores impact 5 / likelihood 1 = 5/25 Medium with no mitigating control; breaches the Threshold-5 appetite and is standing-risk-shaped until a control is added."

That is a description of a _score_. It names no asset, no failure mode, no mechanism and no condition that could occur. "A single staged change" is not a hazard — it is every commit this project has ever made. An entry that fires on all changes and specifies none of them cannot be assessed, treated or monitored, and cannot tell a future assessment anything it did not already know.

**It also contains a scoring error, which is worth recording because it shows how the entry was produced.** It asserts that 5/25 "breaches the Threshold-5 appetite". It does not: `RISK-POLICY.md` sets the appetite at 5 **inclusive**, so 5 is within appetite by definition. The entry was scaffolded from a scorer hint that misread its own threshold, and no human ever read it back — which is precisely the condition P083 was opened against.

**How it got here.** The ADR-056 Phase 2b drain scaffolds a register entry per unique `RISK_REGISTER_HINT` slug. The hint that produced this one was the scorer narrating the _shape_ of a score it had just emitted, not reporting a hazard it had found. The drain cannot tell those apart, so the narration became a permanent register entry with a review date.

Retired rather than curated. There is nothing to score: filling in its fields would mean inventing a hazard to fit a slug. Where a real severe-but-rare uncontrolled hazard exists, it belongs in the entry that names it — R021 and R022 for the deploy axis, R006 for the health coupling, R010 for the standby trade.

**Do not re-open.** If the drain scaffolds this slug again, that is a signal about the drain rather than about this project, and belongs upstream with P086's siblings.
