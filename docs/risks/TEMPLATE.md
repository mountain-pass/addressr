# Risk R<NNN>: <Title>

**Status**: Active <!-- Active | Accepted | Retired -->
**Category**: <!-- infosec (ISO 27001) | operational (ISO 31000) | brand | delivery -->
**Identified**: <YYYY-MM-DD>
**Owner**: <persona or role — e.g., "solo-developer", "plugin-maintainer">
**Last reviewed**: <YYYY-MM-DD>
**Next review**: <YYYY-MM-DD>

## Description

<1-2 paragraph plain-language description of the risk: what could go wrong, for whom, and why it matters. Not the control; the underlying condition.>

## Inherent Risk

Impact × Likelihood _before_ controls are applied.

- **Impact**: <level> (<label from RISK-POLICY.md>)
- **Likelihood**: <level> (<label from RISK-POLICY.md>)
- **Inherent Score**: <product>
- **Inherent Band**: <Very Low | Low | Medium | High | Very High>

## Controls

Existing controls that reduce the risk. Each control cites its implementation location.

- **<control-name>** — <what it does>. Implemented in <file path> / ADR-<NNN>.
- **<control-name>** — <what it does>. Implemented in <file path> / ADR-<NNN>.

## Residual Risk

Impact × Likelihood _after_ controls are applied.

- **Impact**: <level> (<label>)
- **Likelihood**: <level> (<label>)
- **Residual Score**: <product>
- **Residual Band**: <Very Low | Low | Medium | High | Very High>
- **Within appetite?**: Yes / No (appetite threshold per `RISK-POLICY.md`)

## Treatment

One of: **Accept** | **Mitigate** | **Transfer** | **Avoid**

<Description of the treatment decision. If Accept, justify why residual is tolerable. If Mitigate, describe the control plan and link to the ADR or problem ticket that tracks implementation. If Transfer, describe the transfer mechanism. If Avoid, describe what activity is being ceased.>

## Monitoring

- **Trigger to re-assess**: <event or threshold that should prompt re-evaluation ahead of schedule>
- **Metrics**: <if any — e.g., "count of `.risk-reports/` entries above appetite per month">

## Related

- Criteria: `RISK-POLICY.md`
- Realised-as (problems caused by this risk): <links to `docs/problems/P<NNN>`>
- Treatment ADRs: <links to `docs/decisions/ADR-<NNN>`>
- Personas affected: <links to `docs/jtbd/<persona>/persona.md`>

## Change Log

- <YYYY-MM-DD>: Initial identification.
