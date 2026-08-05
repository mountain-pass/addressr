# Risk R024: Ratification Ordering Deviated Adrs Unratified While Wired

**Status**: Retired (2026-08-05 — the subject condition is discharged)
**Category**: <!-- pending review — auto-scaffolded from pipeline hint -->
**Identified**: 2026-07-27
**Owner**: pending review
**Last reviewed**: 2026-08-05
**Next review**: n/a (retired)
**Curation**: pending review (auto-scaffolded 2026-07-27)

## Description

ADR-040 Confirmation criterion 1 (stage does not land before the /wr-architect:review-decisions drain) violated a second time by user direction; ADR-039 and ADR-040 remain proposed/human-oversight-unconfirmed while their deploy and docker axes are wired live, and one drain must now ratify both ADRs plus both amendments.

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

- 2026-07-27T01:56:39Z: fired in `.risk-reports/2026-07-27T01-56-39-commit.md` (reason: user-stated-precondition)

## Change Log

- 2026-07-27: Auto-scaffolded by Phase 2b drain (ADR-056). Pending human curation.

## Retirement (2026-08-05)

ADR-039 and ADR-040 both carry `human-oversight: confirmed` with `oversight-date: 2026-07-27` — the same date, which is direct evidence of the single drain ADR-040 Confirmation criterion 1 demands.

Both of that criterion's live clauses are satisfied: ADR-040 has not reached `accepted` ahead of ADR-039 (neither is accepted), and both were ratified in one pass. The third clause — "Stage 2 does not land before that drain" — was violated and cannot be un-violated: stage 2 landed 2026-07-26, the drain ran 2026-07-27. It is a closed historical fact, and ADR-040 records it in its own body at lines 43 and 79 rather than leaving it to this register.

`status: 'proposed'` is **correct, not drift.** The Confirmation checkboxes are genuinely undischarged, so nothing entitles these ADRs to `accepted`. Undischarged Confirmation items are [P076](../problems/open/076-adr-confirmation-items-can-be-prescribed-and-never-implemented.md)'s subject, whose investigation task 2 is an audit of exactly this corpus. A register entry duplicating it would add nothing.

**Residue recorded, not carried.** The 2026-07-28 GHCR amendment to both ADRs post-dates the `oversight-date: 2026-07-27` marker by a day, so the confirmed marker does not strictly cover the ADRs' current content — a third instance of the ordering pattern this entry's description named as a second. It does not block retirement because ADR-040 records that the user pinned GHCR directly on 2026-07-28 after an auth-token scope probe. The substance was confirmed; only the marker date was not re-issued. That is a provenance-recording gap, materially weaker than the unconfirmed-substance condition this entry was raised for. Now recorded in both ADRs' Oversight notes rather than left implicit here.
