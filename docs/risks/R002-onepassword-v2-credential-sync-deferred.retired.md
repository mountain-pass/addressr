# Risk R002: Onepassword V2 Credential Sync Deferred

**Status**: Retired (2026-08-05 — the condition has no surface in this architecture)
**Category**: <!-- pending review — auto-scaffolded from pipeline hint -->
**Identified**: 2026-07-18
**Owner**: pending review
**Last reviewed**: 2026-08-05
**Next review**: n/a (retired)
**Curation**: pending review (auto-scaffolded 2026-07-18)

## Description

1Password entry for "Addressr v2 OpenSearch" not updated to the just-rotated password; EB↔1P credential planes will diverge until out-of-band sync completes

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

- 2026-05-13T13:11:31Z: fired in `.risk-reports/2026-05-13T13-11-31-commit.md` (reason: user-stated-precondition)
- 2026-05-13T13:13:46Z: fired in `.risk-reports/2026-05-13T13-13-46-commit.md` (reason: user-stated-precondition)

## Change Log

- 2026-07-18: Auto-scaffolded by Phase 2b drain (ADR-056). Pending human curation.

## Retirement (2026-08-05)

Retired for the same architectural fact that retired [R001](R001-aws-managed-opensearch-fgac-password-clobber-on-blue-green.retired.md): there is no FGAC master user, so there is no password for the EB and 1Password planes to diverge _on_.

Verified at source rather than inferred from the entry: `deploy/modules/opensearch/main.tf` carries `# ADR 033: no advanced_security_options block → FGAC off` and no such block exists, and `deploy/main.tf` sets `ELASTIC_PASSWORD = ""`. A grep for `advanced_security_options` returns exactly one hit — the comment stating the block is absent — which is a good example of why a match count is not evidence.

Second, independent reason: the entry names the 1Password item for "Addressr v2 OpenSearch". That domain generation no longer exists; the live module is `module.opensearch_v4`.

This entry never described a live condition post-ADR-033. It is retired as having no surface, not as discharged.
