# Risk R010: Warm Standby Decommission Removes Instant Rollback Net

**Status**: Active
**Category**: operational (ISO 31000) — search-backend migration posture
**Identified**: 2026-07-18
**Owner**: addressr-maintainer
**Last reviewed**: 2026-08-03
**Next review**: 2027-02-03
**Curation**: human-curated 2026-08-03 (superseding the auto-scaffolded pending-review state of 2026-07-18)

## Description

After a search-backend cutover, the previous-generation domain is retained warm as an instant-rollback target: a one-line `ELASTIC_HOST` flip returns production to the known-good analyzer and index in minutes. Destroying that domain removes the net. A subsequent primary-domain failure then has no fast path back, and recovery degrades to a rebuild from G-NAF taking hours, during which the revenue-generating RapidAPI search endpoint is degraded or unavailable.

This is the accepted ADR-035 Option C trade, and it recurs at every backend cutover. **As of 2026-08-02 it is no longer prospective** — `addressr5` was decommissioned (commits `96e965c`, `2e557b9`) and `addressr6` is the sole search domain. This entry now prices a standing posture, not a pending decision.

The trade is worth taking, for a reason that had never been measured until this cycle. Rollback remedies **fast-surfacing** failures — an unreachable domain, a wrong analyzer, an empty index — which appear within the first thousands of requests. It does not remedy slow-surfacing relevance regressions: P069 hid for four years and was fixed forward, not by unwinding a cutover. Retaining a standby to insure against the slow class pays for a control that would never be used.

> Auto-scaffolded 2026-07-18 by the Phase 2b drain (**wr-risk-scorer ADR-056**) from a `wr-risk-scorer:pipeline` RISK_REGISTER_HINT. The description was the agent's prefill and every scoring field carried the **wr-architect ADR-026** ungrounded-output sentinel until this curation. Plugin ADR IDs are qualified because they collide with this repo's own numbering — this repo's ADR-026 is Range-Number Address Expansion, an unrelated search-ranking decision.

## Base rate

Recorded here rather than under Inherent Risk because it is evidence about **control application**, not about the hazard — and it is what stops a procedural control being credited freely below.

Before 2026-08-02 this project had surrendered the warm-standby net **twice without ever exercising it**:

- `addressr3` (v1, OpenSearch 1.3.20) deleted **2026-07-11** — ADR-029's step-9 amendment waived the 7-day soak and recorded "rollback is now rebuild-from-G-NAF (hours), not instant-flip to a warm v1".
- `addressr4` (v2, OpenSearch 2.19) decommissioned **2026-07-14** — ADR-035 Phase 2 step 6, same pattern.

Each was recorded as an accepted trade rather than as a skipped verification. So "we will exercise it later" had a **0-for-2 completion record** — an observed base rate, not a projection. The 2026-08-02 exercise broke it; the retention gate is what stops it re-forming.

## Inherent Risk

Impact × Likelihood _before_ controls.

**Scale interpretation.** `RISK-POLICY.md`'s likelihood descriptors are written about _changes_ ("Change is trivial, isolated, and well-understood"). This is a standing posture, so likelihood is read as the probability of the named condition materialising — a primary-domain failure whose only fast remedy would have been the flip — not as change complexity.

- **Impact**: 5 (Severe) — `RISK-POLICY.md`'s Severe row names "G-NAF index corruption or OpenSearch data loss requiring re-indexing", and rebuild-from-G-NAF **is** that re-indexing case. Not 4: Impact 4 describes degraded results on a serving system, whereas the realisation here is the sole search backend gone with an hours-long rebuild in front of it. (Note the scorer correctly moved a _different_ item on this subsystem from 5 to 4 during the ADR-041 assessment, on the grounds that degraded autocomplete is verbatim Impact 4. That item was consumer result-quality; this one is backend loss.)
- **Likelihood**: 3 (Possible) — a primary-domain failure within the window where rollback would have been the remedy, absent any pre-cutover validation.
- **Inherent Score**: 15
- **Inherent Band**: High

## Controls

**Which controls carry the residual, stated explicitly.** The likelihood drop is carried by the two **evidenced** controls below (soak, exercised rollback) **plus the measured gate application** — stated the same way here and in the Residual bullet, which previously disagreed on whether the gate application was a carrier. That disagreement was load-bearing: the fallback position if the rollback credit is withdrawn is precisely "soak plus the measured gate".

> **Challenged 2026-08-05, and the challenge is sound on its face.** The exercised rollback is credited as a _standing_ carrier, but `addressr5` is decommissioned and `addressr6` is the sole domain — a proven flip has no target to flip to. On that reading it is evidence about the pre-decommission window rather than a control on the standing posture, and Likelihood 1 would rest on the soak plus the measured gate alone. That is the credit-by-name-rather-than-configured-value shape this register has now caught five times, and it bears on this entry's 5 considerably more than the R006 contest does.
>
> **Discharge condition, stated so this cannot become permanent by default.** Settled either by the next standby existing — at which point the drill's transferability is testable rather than arguable — or by a deliberate re-read at this entry's next review (2027-02-03), whichever comes first. Recorded because this entry's own Treatment argues that retention scored above appetite "purely because nothing terminated the decision", and the base rate for recorded-but-unperformed intent here is 0-for-2 on the warm-standby net and 0-for-4 on `deploy_only` dispatches. A challenge without a termination event is the same defect one level up.
>
> Left as a challenge rather than a re-score **because the resolution is not obvious and this entry is at the appetite line**: the counter-argument is that what the drill proved was the _mechanism_ — that an `ELASTIC_HOST` flip reaches EB and stabilises inside ten minutes — which transfers to the next standby whenever one exists, and the standing hazard this entry prices is the decommission decision rather than day-to-day operation. Deciding between those is a judgement about what the drill was evidence _of_. Recorded here so the next reader inherits the question rather than the assumption, and flagged to the maintainer rather than settled while the entry sits at exactly 5. The retention gate is **procedural** — P079's task "consider whether the retention condition should be enforced rather than documented" is still unchecked — so it is not credited as a standing control. What _is_ credited is its this-instance application, which was separately measured. This distinction exists because of the 0-for-2 base rate above: an entry that records procedural pre-decommission controls failing twice and then credits a procedural gate for a two-level drop would argue against itself.

- **ADR-031 read-shadow soak — EVIDENCED.** Mirrors real production query distribution onto the incoming domain **before** any user depends on it. It is a _substitute_ for a long post-cutover retention window rather than a complement: it front-loads the evidence a retention window would otherwise accumulate slowly (cold cache, latency, relevance against the real query mix, doc parity, auth). Most recently 33.8 h with all five Soak Gate criteria passed. Per `ADR-031`.
- **Exercised-and-timed rollback mechanism — EVIDENCED.** The flip is proven, not assumed. Exercised in both directions 2026-08-02 at **6m36s** push-to-EB-updated (commits `43b3309`, `f295bd8`), discharging ADR-029's Confirmation criterion "rollback verified to complete within 10 minutes end-to-end", which had sat open and unmeasured across three prior migrations.
- **Retention gate — PROCEDURAL, this instance verified.** The standby is retained until the primary has served at least 0.25× its average daily request volume since cutover **and** the searchable-documents alarm has not fired. Both conditions, not either. Expressed as a multiple of average daily traffic rather than an absolute count, so it commits safely to a public repo and self-adjusts with traffic. Encoded in `docs/OPENSEARCH-MIGRATION-PLAYBOOK.md` at the decommission step, which governs the next migration. For the 2026-08-02 decommission specifically it was measured at **157% of threshold** on a denominator from 20 representative pre-cutover days, with both trip-wire alarms OK — that measurement, not the gate's existence, is what supports the residual.
  - **Caveat, and it is a second clock.** The quarterly loader was repointed to the new generation at cutover, so a retained standby is warm but **no longer fed**. From the next G-NAF refresh onward a rollback serves progressively staler addresses. This bounds how long retention is worth anything, independently of the decommission decision.
- **AWS automated snapshots on the primary.** `cs-automated-enc`, hourly, verified live 2026-08-02 covering both the `addressr` and `addressr-localities` indices. **Scope honestly:** these restore **in place to the same domain**, so they cover index loss or a red cluster on the primary. They do **not** cover domain-level loss, they are not a cross-domain restore, and they cannot undo a bad analyzer decision, because every snapshot carries the analyzer that took it.
- **Listed, NOT credited — EB health-gated rolling deploy.** `RollingUpdateType: Health`, `MinInstancesInService: 2`, `RollbackLaunchOnFailure: true`, with `/health` probing the search backend. Bounds a bad flip to a degraded subset rather than a fleet-wide outage. In `deploy/main.tf`.

  > **Contested 2026-08-05, and not yet resolved.** [R006](R006-health-probe-couples-elb-pool-to-opensearch-reachability.active.md) — the register's highest residual at 10 — describes the same `/health`-probes-the-search-backend wire as a coupling that _drains_ the ELB pool: instances are pulled for a backend problem they did not cause, cutting serving capacity without reducing load on the saturated thing, so "the mechanism feeds itself". **This entry's score does not depend on it, and an earlier version of this note wrongly said it did.** The likelihood carriers are named above as the soak and the exercised rollback; this bullet is not among them, and Impact is declared irreducible — so the bullet cannot be carrying any of the 5 on either axis. It is therefore demoted here to **listed, not credited**, the idiom this entry already uses for the retention gate.

  The two entries are also describing **different directions of the same wire** and are both right about their own: R006's own Description concedes that a misconfigured cutover must fail the health-gated rolling deploy and trigger `RollbackLaunchOnFailure`, and says the risk is the other direction. The genuinely contested residue is one sub-case — a flip to a _reachable-but-slow_ backend, where the probe passes intermittently, the deploy completes instead of rolling back, and R006's amplifier engages. That sub-case is R006's and R006 already prices it at 10. Neither entry cited the other by ID until now; the conflict was found by the risk scorer reading both.

## Residual Risk

Impact × Likelihood _after_ controls.

- **Impact**: 5 (Severe) — **irreducible.** No control reduces the consequence of an irreversible destroy. Snapshots bound the index-loss subset only; domain-level loss and the wrong-analyzer case remain a rebuild from G-NAF.
- **Likelihood**: 1 (Rare) — carried by the two evidenced controls plus the measured gate application, which together retire the failure classes rollback would have remedied.
- **Residual Score**: 5
- **Residual Band**: Medium
- **Within appetite?**: Yes — appetite is 5, **inclusive**, so this sits exactly at it.

> **Band basis.** Read from `RISK-POLICY.md`'s Label Bands table (5-9 Medium), which `docs/risks/README.md` names as the definition of criteria for this register. The `wr-risk-scorer:create-risk` skill carries a different table (3-5 Low) per plugin ADR-086; that disagreement is tracked upstream. Do not silently "correct" Medium to Low — the repo's policy is authoritative here. The gate is numerically identical either way.

## Treatment

**Accept.**

The acceptance is now **measured rather than assumed**, which is the substantive change from the auto-scaffolded entry. Both states of the world were scored, rather than scoring the action against an implicit zero baseline — that implicit-zero habit is the P077 defect, and this entry is where the corrected reasoning belongs.

| State                                      | Impact × Likelihood | Residual  | Ground                                                                                                                   |
| ------------------------------------------ | ------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------ |
| Retain the standby, now → next refresh     | 4 × 2               | **8/25**  | Standing-state assessment, 2026-08-02. Technical hazard was only 4/25; the excess came from having no termination event. |
| Retain past the next refresh, uncontrolled | 4 × 3               | **12/25** | Same assessment. Divergence begins at the next G-NAF refresh, per the second-clock caveat above.                         |
| Decommission once the gate is met          | 5 × 1               | **5/25**  | This entry.                                                                                                              |

Retaining scored **higher than decommissioning**, and not for any technical reason — it was above appetite purely because nothing terminated the decision. The recurring spend is an **issue** (certain, present, accruing), not a risk, so it does not belong in this matrix; it belongs in the decision, and it is what makes an open-ended overlap the worse state.

The treatment is therefore neither "keep the standby" nor "delete it promptly" but: **retain until the gate is met, then delete.** Self-terminating, measurable, and not dependent on anyone remembering.

**This does not reopen ADR-035.** That ADR chose Option C over A, B and time-boxed A→C; this entry prices the residual of the option it chose, which is what ISO 31000 § 6.4.3 asks for. A re-open would be triggered by ADR-035's own reassessment criteria, not by this scoring. Note also that the table above is **not** ADR-035's A/B/C comparison: those weighed a multi-year running standby, whereas this weighs retention _length_ after a cutover — a question ADR-035 never scored.

## Monitoring

- **Trigger to re-assess**: the open rollback-credit challenge recorded in Controls — settled when a next standby exists, or re-read at the next review date, whichever is first. Also: **a standby decommission is proposed.** This is the correction that matters. The auto-scaffolded entry said "any new pipeline hint with this risk_slug", which is a signal about scorer activity rather than about the hazard, and is precisely why this entry slept through three cutovers unread. The re-read must fire where the decision is actually made.
- **Also re-assess if**: a cutover is performed **without** a comparable read-shadow soak (the 0.25× gate is calibrated on the assumption that the soak front-loaded the evidence, and is too short without it); a retained standby crosses a G-NAF refresh (the second clock); or automated snapshots are found disabled on the primary.
- **Metrics**: retention-gate status at decommission time — served-fraction against the 0.25× threshold, and searchable-documents alarm state. Record the **ratio and the go/no-go only**; absolute request counts are confidential under `RISK-POLICY.md` and this repository is public.

## Related

- Criteria: `RISK-POLICY.md`
- Realised-as: `docs/problems/open/079-rollback-exercised-is-not-a-gate-on-warm-standby-decommission.md` — the treatment ticket, which names this entry as the one it treats. Also `docs/problems/open/077-risk-scorer-rates-deferral-as-mitigation.md`, whose second instance is the implicit-zero-baseline defect the two-state table above corrects.
- Treatment ADRs: `ADR-035` (the Option C trade this entry prices), `ADR-029` (blue/green mechanism; carries the now-discharged 10-minute rollback criterion and the step-9 amendment), `ADR-031` (read-shadow soak), `ADR-041` (the analyzer migration that exercised it).
- Personas affected: `docs/jtbd/web-app-developer/persona.md` — consumers of the search endpoint bear the recovery window. `docs/jtbd/addressr-maintainer/persona.md` — the operator side, who runs the decommission decision.

## Change Log

- 2026-07-18: Auto-scaffolded by the Phase 2b drain (wr-risk-scorer ADR-056). All scoring fields carried the ungrounded sentinel.
- 2026-08-03: **Curated.** Scores grounded in the standing-state and counterfactual assessments run during the ADR-041 decommission. Controls split into evidenced versus procedural, so the residual is not carried by a documented-only gate — the 0-for-2 base rate is why. Snapshot coverage added with its scope limits. Second clock (standby no longer fed after the loader repoint) recorded as a control caveat and a monitoring trigger. Re-assess trigger corrected from "any new pipeline hint", which fired on scorer noise. Band basis stated against the repo's policy table. Realised-as wired to P079 and P077; personas filled. **Shape deliberately extended** with a `## Base rate` section between Description and Inherent Risk, following the R005 precedent; canonical H2s unchanged.

## Evidence Log

- 2026-07-14T06:32:08Z: fired in `.risk-reports/2026-07-14T06-32-08-commit.md` (reason: above-appetite-residual)
- 2026-07-11 / 2026-07-14: the two decommissions this entry slept through unread — the base rate above, and the reason the re-assess trigger changed.
- 2026-08-02: the ADR-041 decommission assessments, which scored both states of the world and produced the residual recorded here.
