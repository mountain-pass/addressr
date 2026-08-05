# Risk R004: Absolute traffic figures committed to a public repository

> **Filename retained deliberately.** The `<slug>` in this file's name is the dedupe key the ADR-056 Phase 2b drain matches on, so renaming it would let the same hazard re-scaffold as a new entry. The H1, the README row and the body carry the corrected scope; the filename is an identifier, not a description.

**Status**: Active — merged surface (absorbs R011 and R016, both retired 2026-08-04)
**Category**: infosec (ISO 31000) — confidential business metrics in a public repository
**Identified**: 2026-07-18
**Owner**: addressr-maintainer
**Last reviewed**: 2026-08-04
**Next review**: 2027-02-04
**Curation**: human-curated 2026-08-04 (superseding the auto-scaffolded pending-review state of 2026-07-18)

## Description

CloudWatch SampleCount range (searches/hour on prod OpenSearch domain) written into ADR 029 amendment prose; RISK-POLICY lists traffic volumes as confidential in this public repo — no pre-commit control scrubs business metrics from committed prose.

> **Origin.** Auto-scaffolded by the Phase 2b drain (`wr-risk-scorer` ADR-056) from a
> `wr-risk-scorer:pipeline` RISK_REGISTER_HINT bullet. The scoring fields **carried** the
> ADR-026 ungrounded-output sentinel until the curation recorded in the Change Log below;
> they are grounded now. The original description was the agent's prefill.

## Merged surface

Three register entries described one hazard: **absolute traffic figures committed to a public repository**. R011 and R016 are retired into this one, which carries the general scope. R016's own description said as much — "standing R011 surface awaiting curation" — so it was a known duplicate that outlived the curation it was waiting for by a fortnight. The instances were an ADR-029 amendment carrying a CloudWatch searches-per-hour range, a briefing file re-committing a previously-scrubbed read-shadow figure, and a P035 known-error doc restating a production query rate with raw attempt and success counts.

**The register reproduced the disclosure it exists to prevent.** R016's description carried a live production query rate in committed public prose. It was scrubbed at retirement, which removes the live surface; a history rewrite is not proportionate here. Worth stating plainly because it is the sharpest available evidence that a control which depends on remembering does not hold — the entry warning about the failure committed the failure.

## Inherent Risk

Impact × Likelihood _before_ controls.

- **Impact**: 3 (Moderate) — `RISK-POLICY.md` names traffic volumes among its Confidential Information classes and this repository is public, so a committed figure is an information-disclosure incident whose remedy is a history rewrite. It reaches no consumer and breaks nothing; the cost is disclosure and the cleanup.
- **Likelihood**: 4 (Likely) — an observed base rate, not a projection. Three separate instances across ADR prose, a briefing file and a problem ticket, one of them a RE-commit of a figure that had already been scrubbed once, and a fourth inside a register entry describing the hazard.
- **Inherent Score**: 12
- **Inherent Band**: High

## Controls

- **The external-comms gate — EVIDENCED, and the strongest control here.** Every commit message, changeset, issue body and PR body routes through `wr-risk-scorer:external-comms`, which reads `RISK-POLICY.md`'s Confidential Information classes and FAILs on a match. Exercised roughly twenty times across the 2026-08-02 to 2026-08-04 session; it checked the traffic-figure class on every one and passed each because the prose carried ratios rather than counts.
- **Express-as-ratio discipline — EVIDENCED in use, PROCEDURAL in nature.** The convention is to commit ratios and go/no-go verdicts, never absolute counts. It held throughout the ADR-041 retention-gate work, where the gate result was recorded as "157% (0.392x against a 0.25x threshold)" with the denominator explicitly withheld as confidential. It is a habit, and the base rate above is what happens when a habit is the only control.
- **NOT a control: the gate does not scan committed FILES.** It scans the prose you pass to a reviewed surface. A figure written directly into a `docs/` file and committed under a message that mentions nothing about it passes untouched. Every one of the four instances landed this way. Naming this explicitly because the gate's twenty passes could otherwise be read as covering a surface it never sees.

## Residual Risk

Impact × Likelihood _after_ controls.

- **Impact**: 3 (Moderate) — unchanged. No control alters what a disclosure costs.
- **Likelihood**: 3 (Possible) — down from Likely, not further. The gate genuinely covers the message and changeset surfaces, which is where most outbound prose goes. But the file-content surface is uncovered by anything mechanical, and that is where all four instances occurred.
- **Residual Score**: 9
- **Residual Band**: Medium
- **Within appetite?**: **No.** Appetite is 5, inclusive.

## Treatment

**Mitigate — and this entry is deliberately left above appetite rather than scored down to it.**

The honest position is that the residual reflects an uncovered surface, and writing it down at 9 is more useful than crediting the ratio-discipline habit for a drop the base rate does not support. Four instances is not a rate that a convention has controlled.

The concrete candidate treatment is a **pre-commit scrub for the file surface** — a hook that greps staged `docs/**` and comment prose for figures in the shapes that carry traffic meaning (`N/s`, `N q/s`, `N per hour`, `N searches`, raw counts adjacent to soak or shadow vocabulary) and denies with a pointer to the ratio convention. This is the control the four instances all needed and none had. It is not yet built; recording it as the named treatment rather than pretending the current state is adequate.

Until it exists, the operative control is the ratio convention plus the reviewer's attention on the surfaces the gate does see.

## Monitoring

- **Trigger to re-assess**: a fifth instance, or the pre-commit scrub landing. Deliberately NOT "a new pipeline hint with this slug" — that fires on scorer activity rather than on the hazard, which is the trigger shape that left this register uncurated (P083).
- **Metrics**: instance count. Four as of 2026-08-04.

## Related

- Criteria: `RISK-POLICY.md` § Confidential Information
- Absorbs: **R011** (read-shadow soak traffic count in committed docs) and **R016** (read-shadow soak traffic figures in committed docs), both retired 2026-08-04 into this entry.
- Personas affected: `docs/jtbd/addressr-maintainer/`

## Evidence Log

Auto-populated from `.risk-reports/` via Phase 2b drain.

- 2026-07-06T14:42:39Z: fired in `.risk-reports/2026-07-06T14-42-39-commit.md` (reason: confidentiality-disclosure)

## Change Log

- 2026-07-18: Auto-scaffolded by the Phase 2b drain (ADR-056, plugin-scoped). Pending human curation.
- 2026-08-04: Curated, and **R011 and R016 merged in and retired**. All three described one hazard; R016's description had itself flagged the duplication and then outlived the curation it was waiting for. Scored 12 inherent / 9 residual and deliberately LEFT ABOVE APPETITE, because the file-content surface where all four instances occurred is covered by no mechanical control and crediting the ratio-discipline habit for a drop to appetite would contradict the base rate. Named treatment is a pre-commit scrub, not yet built. Curated as part of the P083 register drain.
