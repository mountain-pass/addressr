# Problem 079: "Rollback exercised" is not a gate on warm-standby decommission, so the net is surrendered untested

**Status**: Open
**Reported**: 2026-08-02
**Priority**: 12 (High) — Impact: Significant (4) × Likelihood: Likely (3) — derived at capture; see Impact Assessment for the observed base rate
**Origin**: internal
**Effort**: M — derived at capture: a playbook gate plus a register-entry curation, no runtime code
**JTBD**: JTBD-001
**Persona**: web-app-developer

## Description

Nothing in the migration playbook, in ADR-029, or in any commit gate requires the rollback path to have been **exercised** before the warm standby it depends on is decommissioned. The exercise is described in runbooks as a step, but a step in a runbook is a suggestion; the decommission is a separate action taken later, usually in a different session, and nothing connects them.

The consequence is not hypothetical. **This project has surrendered the warm-standby rollback net twice without ever exercising it**, each time recording the loss as an accepted trade rather than as a skipped verification:

- `addressr3` (v1, OpenSearch 1.3.20) deleted **2026-07-11**. ADR-029's step-9 amendment waived the 7-day soak and recorded: "rollback is now rebuild-from-G-NAF (hours), not instant-flip to a warm v1."
- `addressr4` (v2, OpenSearch 2.19) decommissioned **2026-07-14** (ADR-035 Phase 2 step 6), same pattern.

So "we will exercise it later" has a **0-for-2 completion record** here. That is an observed base rate, not a projection, and it is precisely what register entry R010 (`warm-standby-decommission-removes-instant-rollback-net`) was scaffolded to name — while itself sitting uncurated with `not estimated` in every scoring field.

The drill finally ran on 2026-08-02 (see `## Related`), which discharges the evidence for the CURRENT pair. It does not fix the structural gap: the next migration re-opens it, and the next decommission after that will face the same absent gate.

## Symptoms

A warm standby is decommissioned on the strength of a rollback path that has never been executed. Every risk assessment that credited "rollback is a one-line flip" as a control was, at that moment, crediting an untested control — which is the failure mode where the residual is wrong in the unsafe direction rather than the conservative one.

## Workaround

Run the drill manually before each decommission and remember to do so. That is the workaround that has failed twice.

## Impact Assessment

- **Who is affected**: RapidAPI consumers, during whatever incident makes the rollback necessary. Also every future risk assessment that credits the rollback path as a control.
- **Frequency**: fires once per migration/decommission cycle. Two occurrences observed (2026-07-11, 2026-07-14); a third was avoided only because the drill was run deliberately on 2026-08-02 after a direct user challenge.
- **Severity**: Significant. Realises during a rollback attempt — i.e. when the primary is ALREADY degraded and the documented recovery is the thing being relied on. Recovery then degrades to rebuild-from-G-NAF (hours) per ADR-035's Option C trade.
- **Analytics**: the 2026-08-02 drill measured the exercised path at **6m36s** push-to-EB-updated, against ADR-029's 10-minute criterion. So the path does work when exercised — which is exactly why the gate is worth having rather than the exercise being treated as optional.

## Root Cause Analysis

The exercise and the decommission are separated in time and recorded in different artefacts, with no mechanism binding them. A runbook step is honoured by the session that reads the runbook; a decommission months later reads the infrastructure, not the runbook.

Secondary contributor: the counterfactual is invisible to per-action risk scoring. Not-exercising scores as nothing because the hazard attaches to a _different, later_ action. See the sibling ticket on that scoring defect in `## Related`.

### Investigation Tasks

- [ ] Add "rollback flip exercised and timed since the last cutover" as a standing PRE-DECOMMISSION gate in `docs/OPENSEARCH-MIGRATION-PLAYBOOK.md`
- [ ] Decide whether the gate is prose-only or enforced (a `deploy/**` check that fails when a domain module is removed without a recorded exercise)
- [ ] Prefer scheduling the exercise in migrations where blue and green are behaviourally EQUIVALENT, so the drill costs zero consumer-visible defect — the 2026-08-02 drill cost a real P069 window only because the analyzer divergence was the point of that migration
- [ ] Curate R010 out of its auto-scaffold `not estimated` state with real Impact/Likelihood/Controls, now that the counterfactual has been scored at 15/25

## Dependencies

- **Blocks**: decommissioning `addressr5` (v3). Per `deploy/main.tf` and the P069 runbook, v3 is eligible only after the rollback exercise — which has now happened, so this does not block today. It blocks the NEXT cycle.
- **Blocked by**: (none)
- **Composes with**: P069

## Related

- **The 2026-08-02 rollback drill** — commits `43b3309` (flip to v3) and `f295bd8` (flip forward to v4). Discharged ADR-029's Confirmation criterion "rollback verified to complete within 10 minutes end-to-end", which had been open and unmeasured across three migrations. Measured 6m36s.
- **R010** (`docs/risks/R010-warm-standby-decommission-removes-instant-rollback-net.active.md`) — the register entry this ticket is the treatment for. Currently uncurated (`not estimated — no prior data` in every scoring field), so it carried no baseline into any of the three cutovers.
- **ADR-029** — carries the 10-minute rollback criterion, and its step-9 amendment is where the first unexercised surrender was recorded as an accepted trade. Its step-7 clarification also still instructs "Rollback = git-revert the cutover commit", which is now wrong: `33e6c04` bundles five changes and reverting it would re-enable the read-shadow and re-arm a retired alarm.
- **ADR-035** — Phase 2 step 6, the second unexercised surrender.
- **P069** — its runbook step 4 is the only place the exercise is currently written down, which is the problem: it is scoped to one migration rather than standing.
- A second finding from the same drill, worth its own treatment: the quarterly loader was repointed to `gha_v4_loader` at the cutover, so the rollback target is **no longer fed**. Every G-NAF refresh makes a rollback serve staler data — a second clock on the net, independent of the decommission decision, and invisible before the drill forced the question.

**Provenance note for anyone bisecting.** This ticket, P080, and the second instance appended to P077 all entered history at commit `d24a009`, whose subject reads "chore: clear the three drift items the risk scorer flagged on the retro push" and does not mention them. The intended ticketing commit was blocked at the gate on its first attempt; on the retry `docs/` was staged broadly to pick up formatting drift, which swept the ticket changes in alongside the drift fixes. Content is correct; only the commit subject under-describes its diff. The commit was already pushed and per project practice is not amended.

Origin: internal, surfaced 2026-08-02 when a directed rollback drill exposed that the exercise had never once been completed before a decommission, despite being written into two runbooks.
