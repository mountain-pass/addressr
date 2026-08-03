# Risk R001: AWS-managed OpenSearch FGAC password clobber on blue/green

**Status**: Retired (2026-08-04 — the condition has no surface in this architecture)
**Category**: infosec (ISO 31000) — search-backend authentication
**Identified**: 2026-07-18
**Owner**: addressr-maintainer
**Last reviewed**: 2026-08-04
**Next review**: n/a (retired)
**Curation**: curated at retirement 2026-08-04 (superseding the auto-scaffolded pending-review state of 2026-07-18)

## Description

Third observation of AWS-managed OpenSearch resetting FGAC master user password during blue/green ops (provision, recreate, resize); pattern recurs across instance changes and is invisible to CloudTrail; soak gate repeatedly tripped

> Auto-scaffolded by the Phase 2b drain (ADR-056) from a `wr-risk-scorer:pipeline`
> RISK_REGISTER_HINT bullet. The description is the agent's prefill; scoring
> fields below carry the ADR-026 ungrounded-output sentinel until human curation.

## Inherent Risk

Impact × Likelihood _before_ controls, scored against the architecture that existed when the hint fired (FGAC on).

- **Impact**: 4 (Significant) — an FGAC master-user password reset locks the loader and the serving path out of the domain until the credential is re-established. `RISK-POLICY.md` Impact 4 is degraded results on a serving system; a total auth failure sits at that line rather than above it, because the index and its data survive intact.
- **Likelihood**: 4 (Likely) — the hint recorded a THIRD observation, across provision, recreate and resize. That is an observed base rate on a recurring operation, not a projection.
- **Inherent Score**: 16
- **Inherent Band**: High

## Controls

- **FGAC removed entirely — EVIDENCED, and the reason this entry retires.** `deploy/modules/opensearch/main.tf:24` carries no `advanced_security_options` block, and the file's header comment states the consequence in as many words: "ADR 033: FGAC disabled. Authentication is IAM/SigV4 … P036 FGAC master-user clobber has no surface here." There is no master user, so there is no master-user password for a blue/green operation to reset. Per `ADR-033`.
- **IAM/SigV4 request signing** replaced it. Credentials are AWS-issued and rotate through the normal IAM path, which no OpenSearch domain operation touches. `deploy/modules/opensearch/main.tf:39` records the scoped access policy as an ADR-033 non-negotiable invariant.

## Residual Risk

Impact × Likelihood _after_ controls.

- **Impact**: 4 (Significant) — unchanged. The control removes the mechanism, not the consequence it would have had.
- **Likelihood**: 1 (Rare) — the failure requires an FGAC master user to exist. Re-introducing one would be an ADR-033 supersession, which is a deliberate act with its own review, not a drift.
- **Residual Score**: 4
- **Residual Band**: Low
- **Within appetite?**: Yes (appetite is 5, inclusive)

## Treatment

**Avoid** — and this is genuinely avoidance rather than mitigation. ADR-033 removed the feature the risk attaches to. There is no residual FGAC surface being watched or compensated for; the hazard has no mechanism.

Worth stating plainly because the register should not carry a permanently-Rare entry as though it were live: this risk cannot fire while ADR-033 stands. Its correct home is the retired set, where it documents why the architecture looks the way it does.

## Monitoring

- **Trigger to re-assess**: a proposal to enable FGAC — i.e. any change adding an `advanced_security_options` block to `deploy/modules/opensearch/main.tf`, or any supersession of ADR-033. Note this is deliberately NOT "a new pipeline hint with this slug": scorer activity is not the event that matters, and re-assessment triggered on scorer noise is what left the register uncurated for a fortnight (P083).
- **Metrics**: none. A boolean architectural condition does not need a counter.

## Related

- Criteria: `RISK-POLICY.md`
- Treatment ADRs: **ADR-033** (IAM/SigV4 auth for the AWS-managed OpenSearch domain) — the decision that removed the mechanism.
- Realised-as: **P036** — the clobber as observed under the previous FGAC architecture. Retained as the historical record of why ADR-033 exists.
- Personas affected: `docs/jtbd/addressr-maintainer/`

## Evidence Log

Auto-populated from `.risk-reports/` via Phase 2b drain.

- 2026-05-13T13:11:31Z: fired in `.risk-reports/2026-05-13T13-11-31-commit.md` (reason: above-appetite-residual)
- 2026-05-13T13:13:46Z: fired in `.risk-reports/2026-05-13T13-13-46-commit.md` (reason: above-appetite-residual)

## Change Log

- 2026-07-18: Auto-scaffolded by Phase 2b drain (ADR-056). Pending human curation.

## Change Log

- 2026-07-18: Auto-scaffolded by the Phase 2b drain (ADR-056, plugin-scoped). Pending human curation.
- 2026-08-04: Curated and **retired**. Verified against source rather than against the ticket that proposed the retirement: `deploy/modules/opensearch/main.tf` has no `advanced_security_options` block and states the discharge explicitly. Scoring fields were filled in before retirement rather than left as sentinels, following the R005 precedent, so the entry records what the risk WAS worth as well as why it no longer applies. Curated as part of the P083 register drain.
