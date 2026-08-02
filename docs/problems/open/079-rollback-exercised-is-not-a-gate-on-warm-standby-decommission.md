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

The drill ran on 2026-08-02 (see `## Related`) and discharged the evidence. Per the user direction recorded under Treatment, that is a ONE-OFF: the mechanism is now proven and future cutovers do not re-prove it. The structural gap this ticket treats is therefore not "nobody re-runs the drill" but "nothing stops the standby being deleted while rollback is still worth having".

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

### Treatment — settled by user direction 2026-08-02

The original framing of this ticket proposed a **repeating** pre-decommission exercise gate. That is not the treatment. User direction, verbatim in substance:

> "We don't need to prove rollback each time. We've done it today, so all good. The treatment for the risk is to keep the old server for a period. After a certain number of successful requests, the need for a rollback disappears. The server cannot be deleted until we reach that point."

Two consequences, both deliberate:

1. **Proving the mechanism is a ONE-OFF, and it is done.** The 2026-08-02 drill discharged it (6m36s, ADR-029 Confirmation). Future cutovers do not re-prove it. This ticket should NOT install a per-migration drill requirement — that was over-engineering on my part, and it would cost a real consumer-visible defect window every time for evidence already held.
2. **The control is a RETENTION CONDITION, not a ritual.** The standby is retained until the new primary has served a set multiple of its average daily request volume since cutover. Expressing the threshold as a multiple rather than a raw count keeps it committable to a public repo, and it self-adjusts with traffic instead of quietly changing meaning as volume moves. Delete is blocked until then; after it, the risk closes on its own. This is self-terminating and measurable, where the exercise gate depended on somebody remembering.

**Accepted trade, user-confirmed 2026-08-02**: a rollback taken late in the retention window serves STALE address data. The quarterly loader was repointed to the new domain at cutover, so the standby is warm but no longer fed; from the next G-NAF refresh onward its data ages. This is accepted rather than mitigated — dual-feeding the standby was considered and not chosen.

### Investigation Tasks

- [x] **N = 0.25, set by user direction 2026-08-02.** The standby is retained until the primary has served **a quarter of its average daily request volume** since cutover, AND the searchable-documents alarm has not fired. Both conditions, not either. The alarm half exists because a quarter-day can elapse overnight unattended, so the automated check covers what nobody is awake to see; its SNS subscription was confirmed 2026-08-02 and now reaches a human.

  Sizing rationale, recorded so the number is not re-litigated from scratch: rollback remedies **fast-surfacing** failures — an unreachable domain, a wrong analyzer, an empty index. Those are invariant to time of day and show up in the first thousands of requests. It does not remedy slow-surfacing relevance regressions; P069 hid for four years, and nobody unwinds a months-old cutover to fix one, they fix forward. Sizing the standby window for the slow class would pay standby cost for a control that would never be used. An earlier proposal of N=14 made exactly that error by treating post-cutover retention as another pre-cutover soak; it is not one.

  **Why 0.25 is enough here, and when it would NOT be.** The retention window and the ADR-031 read-shadow soak are **substitutes, not complements**. The soak ran real production traffic against the new domain for 33.8 hours BEFORE any user depended on it, so the evidence a long retention window would slowly accumulate was already front-loaded — cold cache and latency, relevance against the real query distribution, doc parity, auth and config. What is genuinely unique to being PRIMARY rather than shadowed is narrow: the mirror call is gone, and errors reach real users instead of a fire-and-forget path. Both manifest in the first requests, not after hours. A cutover performed WITHOUT a comparable pre-cutover soak has none of that front-loaded evidence, and 0.25 would be too short — do not copy the number across without checking the soak was done.

- [ ] Compute the denominator from the primary's **representative pre-cutover** traffic, excluding idle days — the cutover day itself reads near-zero on the old domain and would poison a naive average
- [ ] Encode the retention condition where it will actually be read: `docs/OPENSEARCH-MIGRATION-PLAYBOOK.md` at the decommission step, and the `deploy/main.tf` comment on the standby module.
- [ ] Set R010's treatment to this retention condition and its re-read trigger to "a standby decommission is proposed" — currently it fires only on scorer hint noise, which is why it slept through three cutovers. Route via `/wr-risk-scorer:create-risk` rather than editing scoring fields by hand.
- [ ] Consider whether the retention condition should be enforced rather than documented (a check that fails when a domain module is removed before the retention date)

## Dependencies

- **Blocks**: decommissioning `addressr5` (v3). Per `deploy/main.tf` and the P069 runbook, v3 is eligible only after the rollback exercise — which has now happened, so this does not block today. It blocks the NEXT cycle.
- **Blocked by**: (none)
- **Composes with**: P069

## Related

- **The 2026-08-02 rollback drill** — commits `43b3309` (flip to v3) and `f295bd8` (flip forward to v4). Discharged ADR-029's Confirmation criterion "rollback verified to complete within 10 minutes end-to-end", which had been open and unmeasured across three migrations. Measured 6m36s.
- **R010** (`docs/risks/R010-warm-standby-decommission-removes-instant-rollback-net.active.md`) — the register entry this ticket is the treatment for. Currently uncurated (`not estimated — no prior data` in every scoring field), so it carried no baseline into any of the three cutovers.
- **ADR-029** — carried the 10-minute rollback criterion, **now discharged 2026-08-02 at 6m36s** by this drill. Its step-9 amendment is where the first unexercised surrender was recorded as an accepted trade; that record is deliberately left intact, because rewriting it would erase the fact this ticket is built on. It also carried TWO distinct stale rollback mechanisms, both corrected 2026-08-02 rather than rewritten: the Stage 5 blockquote's "Rollback = git-revert the cutover commit" (true for the single-commit v1→v2 cutover it describes, wrong as general guidance now that `33e6c04` bundles five changes), and the step-7 clarification's instruction to update the `TF_VAR_ELASTIC_HOST` secret (that secret was cleared 2026-07-11, and the loader has been decoupled from `ELASTIC_HOST` since ADR-034). The same wrong mechanism was live in `docs/OPENSEARCH-MIGRATION-PLAYBOOK.md` in two places, which matters more — the playbook is what an operator reads under pressure.
- **ADR-035** — Phase 2 step 6, the second unexercised surrender.
- **P069** — its runbook step 4 is the only place the exercise is currently written down, which is the problem: it is scoped to one migration rather than standing.
- A second finding from the same drill, worth its own treatment: the quarterly loader was repointed to `gha_v4_loader` at the cutover, so the rollback target is **no longer fed**. Every G-NAF refresh makes a rollback serve staler data — a second clock on the net, independent of the decommission decision, and invisible before the drill forced the question.

**Provenance note for anyone bisecting.** This ticket, P080, and the second instance appended to P077 all entered history at commit `d24a009`, whose subject reads "chore: clear the three drift items the risk scorer flagged on the retro push" and does not mention them. The intended ticketing commit was blocked at the gate on its first attempt; on the retry `docs/` was staged broadly to pick up formatting drift, which swept the ticket changes in alongside the drift fixes. Content is correct; only the commit subject under-describes its diff. The commit was already pushed and per project practice is not amended.

Origin: internal, surfaced 2026-08-02 when a directed rollback drill exposed that the exercise had never once been completed before a decommission, despite being written into two runbooks.
