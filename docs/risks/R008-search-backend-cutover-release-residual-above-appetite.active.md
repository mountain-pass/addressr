# Risk R008: A cutover ranking regression passes the health gate and ships silently

**Status**: Active
**Category**: operational (ISO 31000) — search result quality on the revenue endpoint
**Identified**: 2026-07-18
**Owner**: addressr-maintainer
**Last reviewed**: 2026-08-05
**Next review**: 2027-02-05
**Curation**: human-curated 2026-08-05 (superseding the auto-scaffolded pending-review state of 2026-07-18)

## Description

Production OpenSearch major-version cutover flips live search serving; residual stays Medium (8/25) above appetite because the deploy-time /health auto-rollback catches connection failures but not subtle ranking/scoring regression at full production query distribution — a standing risk for every future search-backend cutover.

> **Origin.** Auto-scaffolded by the Phase 2b drain (`wr-risk-scorer` ADR-056) from a
> `wr-risk-scorer:pipeline` RISK_REGISTER_HINT bullet. The scoring fields **carried** the
> ADR-026 ungrounded-output sentinel until the curation recorded in the Change Log below;
> they are grounded now. The original description was the agent's prefill.

## Base rate — this fired at the most recent cutover, and it is measurable

Not hypothetical. The ADR-041 blue/green cutover was measured across 800 pairs sampled from `test/perf/exact-vs-range-frame.json`, each queried through both domains with the production query shape and sort:

- **793 of 800 top-1 results unchanged.** 4 regressions, 3 improvements, **net −1**.
- Every one of the 4 regressions was a sub-unit reorder at the _correct_ street address, which is the already-known P073 surface rather than a new class.
- Three genuine exact-to-range flips were found by targeted hand search across the full 5,991-pair frame — real but rare, on the order of 0.05%.

So the hazard is real and it fired. It was judged acceptable on the evidence, which is the right outcome, and the point is that **the judgement was only possible because someone measured**. Nothing in the deploy path would have surfaced those four regressions.

**The four-year proof of the hiding half.** P069 — partial-prefix recall dropping on longer queries — was live in production from 2022 until 2026-08-02. The health gate saw nothing wrong for four years because nothing was wrong with the _connection_; the results were simply worse. That is this entry's realisation shape, at its full duration.

## Inherent Risk

Impact × Likelihood _before_ controls.

- **Impact**: 4 (Significant) — `RISK-POLICY.md`'s Impact 4 names degraded results on a serving system, which is this exactly. Consumers receive plausible-looking wrong answers on a paid address-search API. Not Impact 5: the service is up, the data is intact, and no re-index is required to recover — a query-shape fix ships as an ordinary release.
- **Likelihood**: 4 (Likely) — a cutover changes the analyzer, the engine version, or both, and BM25 scoring is corpus-relative. ADR-041 produced measurable ranking movement; the question at any cutover is the size of the movement, not whether there is any.
- **Inherent Score**: 16
- **Inherent Band**: High

## Controls

- **The `exact-vs-range-frame.json` relevance frame — EVIDENCED as a TOOL, not as a gate.** 5,991 pairs, and it is what made the ADR-041 measurement possible. This is the control that did not exist when this entry was scaffolded, and it is the reason the residual below is not simply the inherent score. **But `grep` confirms it is not referenced by anything under `test/integration/`, and CI's `test:integration:search` step does not run it.** It is a tool someone chose to reach for, which is a procedural control however good the tool is.
- **The ADR-031 read-shadow soak — EVIDENCED, and it addresses a different failure.** 33.8 hours of mirrored production traffic against the incoming domain before any user depended on it, with all five Soak Gate criteria passed. It exercises the real query distribution and would surface an empty index, a wrong analyzer, or an auth failure. It does **not** compare _result quality_ between old and new; nothing in the soak asserts that the answers are as good.
- **NOT a control: the deploy-time `/health` auto-rollback.** This is the entry's whole subject. It probes reachability. A domain that is up and returning worse answers passes it every time, which is precisely how P069 survived four years. Naming it here so no future reader credits it.
- **NOT a control: the fixture-scale Cucumber suite.** P074 established, and P078 re-confirmed, that fixture-scale tests cannot reproduce corpus-relative IDF. The OT fixture is 5,186 documents against a production corpus orders of magnitude larger; scoring behaviour does not survive the scale change.

## Residual Risk

Impact × Likelihood _after_ controls.

- **Impact**: 4 (Significant) — unreduced. No control here changes what a shipped regression costs a consumer.
- **Likelihood**: 2 (Unlikely) — **that a regression ships UNDETECTED**, which is the hazard, rather than that a regression occurs at all. The frame exists and was reached for at the most recent cutover. It was not reached for at the three before it.
- **Residual Score**: 8
- **Residual Band**: Medium
- **Within appetite?**: **No.** Appetite is 5, inclusive.

**The 8 is the lenient end of a defensible range, and that was checked.** The risk scorer was asked directly whether crediting the frame as a tool rather than a gate was an over-correction. It is not, and the exposure runs the other way: this entry scores _a regression ships undetected_, so the frame reduces likelihood only in proportion to how reliably it is applied — and the application record is **one cutover in four**. On that skip rate a likelihood of 3 (residual 12) would also be defensible. What actually carries the drop from 4 to 2 is the restatement of the hazard from "a regression occurs" to "a regression ships undetected", plus the ADR-031 soak retiring the connection-class failures — not the frame's existence. The disposition is Mitigate and above appetite at either number, so the digit does not move the decision; it is recorded here so a future reader knows the margin was examined rather than assumed.

**Why likelihood is not 1.** The frame is a tool, not a gate. Nothing requires it to be run, nothing fails if it is skipped, and the last three cutovers did skip it. Crediting a tool as though it were a control is exactly the error this drain corrected on R003 — where a "Rolling" deploy policy was credited for incrementality it did not have — and on R010, R022 and R004, where procedural controls were declined for likelihood drops. Same discipline here.

## Treatment

**Mitigate.** The tool exists; the gap is that it is optional.

The named treatment is to **make the relevance frame a cutover gate rather than a cutover option**: a documented step in `docs/OPENSEARCH-MIGRATION-PLAYBOOK.md` that runs the frame against both domains and records the delta before the flip, with a stated threshold for what constitutes a blocking regression. The ADR-041 run is the worked example — 800 pairs, net −1, judged acceptable with the reasoning written down.

Deliberately NOT proposed: putting the full frame in CI on every push. It needs two live domains to compare and takes far longer than a push-gate budget allows. This is a cutover-time control, and the cutover playbook is where it belongs.

## Monitoring

- **Trigger to re-assess**: any search-backend cutover is proposed — which is the decision point where this entry needs reading, and the reason its trigger is not "a new pipeline hint with this risk_slug" (that fires on scorer activity and is why the register sat uncurated, per P083). Also: a consumer-reported relevance defect, which would be evidence the gap realised.
- **Metrics**: whether the frame was run at each cutover, and the measured delta. One-for-four as of 2026-08-05.

## Related

- Criteria: `RISK-POLICY.md`
- Realised-as: **P069** (partial-prefix recall drop) — the four-year proof that this hazard hides; **P075** and **P078** — the exact-vs-range inversions found by running the frame at the ADR-041 cutover; **P073** — the sub-unit reorder class the four measured regressions belong to.
- Treatment ADRs: **ADR-031** (read-shadow soak) covers the connection-class failures this entry excludes; **ADR-041** (equivalent synonyms) is the cutover that produced the base rate above.
- Siblings, deliberately NOT consolidated (see P083): **R009** — the same cutover event, but the _concurrency_ gap rather than the _relevance_ gap; **R003** — names this same blind spot in the EB deploy's auto-rollback.
- Personas affected: `docs/jtbd/web-app-developer/`

## Evidence Log

Auto-populated from `.risk-reports/` via Phase 2b drain.

- 2026-07-13T02:39:43Z: fired in `.risk-reports/2026-07-13T02-39-43-commit.md` (reason: above-appetite-residual)

## Change Log

- 2026-07-18: Auto-scaffolded by the Phase 2b drain (ADR-056, plugin-scoped). Pending human curation.
- 2026-08-05: Curated. Scored 16 inherent / **8 residual, above appetite**, Treatment **Mitigate**. The scaffolded 8/25 turned out to be the right number for the wrong reason: it was a scorer estimate, and this is now grounded in a measured base rate (ADR-041's 800-pair comparison, 4 regressions and 3 improvements, net −1) plus P069's four-year hiding duration. The `exact-vs-range-frame.json` control did not exist when this was scaffolded; it is credited as a **tool** rather than a gate, because `grep` confirms CI does not run it and the last three cutovers did not use it. Likelihood 2 rather than 1 for exactly that reason — the same discipline applied to R003's "Rolling" policy name and R022's pathspec habit. Curated as part of the P083 register drain.
- 2026-08-05: Cross-references to R022 and R004 re-verified three times this sitting — after both moved, after R022 recorded its live `deploy/**` drift cleared, and after R022 declared canonical state. All three came back unchanged for one reason: this entry borrows R022 and R004 for a **discipline** (do not credit a procedural control for a likelihood drop), not for a fact about their subjects. R022 clearing its live instance while holding its residual at 5 is that discipline being applied, not contradicted. Consolidated into one bullet rather than stacked — restating the same verification three times is the decay R028 names. Recorded per the review-fence check.
