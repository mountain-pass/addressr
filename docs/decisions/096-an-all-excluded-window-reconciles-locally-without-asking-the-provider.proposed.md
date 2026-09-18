---
status: 'proposed'
date: 2026-09-18
human-oversight: confirmed
oversight-date: 2026-09-18
decision-makers: [Tom Howard]
consulted: [wr-architect:agent]
informed: []
supersedes-clause: 095#empty-window-matching, 095#option-5-rejection-ground
reassessment-date: 2026-12-18
---

# An all-excluded window reconciles locally, without asking the provider

## Context and Problem Statement

ADR-095 decided that a reconciliation window whose billable rows were ALL served past a
hard cap still records what it expected and what it deliberately did not meter. It flagged,
as an acceptance nobody had been asked about, that this costs one provider summary call per
organisation per such window, on a scheduled path carrying no performance budget, and said
the cost should be put to the maintainer before release 2 ships.

It was put on 2026-09-18 with three answers available: accept it, accept it and give the
scheduled path a budget, or find a way without the call. **The maintainer chose the third.**

A way exists, and it is not merely cheaper. It detects the failure the call was there to
catch EARLIER and MORE DIRECTLY than the call would.

## Decision Drivers

- The maintainer declined the cost. That settles whether to pay it, not what replaces it.
- Whatever replaces it must still catch the exclusion regressing, which is the failure
  ADR-095 rejected its own option 5 for failing to catch.
- A mechanism that holds a property by accident is not a control. The design below is
  correct today for a reason that one natural tidy-up would silently break, so that reason
  has to be pinned rather than relied on.
- Nothing has shipped that writes either column. The channel has never been activated.

## Considered Options

ADR-095 put three. This record adds a fourth that was not on the table when the maintainer
answered on 2026-09-18, which is precisely why it owes its own record rather than an edit.

1. **Record the row, decide it locally, make no provider call. Chosen.** When
   `expected_count == unmeterable_count`, nothing was owed, and the window is decidable
   from local state alone: `delivered_count == 0` means matched, and anything else means
   mismatched.
2. **ADR-095's chosen shape, paying the call.** Rejected by the maintainer on 2026-09-18.
   Not wrong, and it remains the fallback if the ground below is ever falsified.
3. **Record `expected_count = 0`.** Still rejected, on ADR-095's unchanged ground: it leaves
   no positive trace that the gap was intended.
4. **Record nothing for the window.** Still rejected, but THE GROUND HAS CHANGED and that
   change is the second clause this record supersedes. See below.

## Decision Outcome

Chosen: **option 1.** When a window's billable rows were all deliberately unmetered, the
window is reconciled from local state and no provider call is made. `provider_count` is
stored as NULL, which is not a new column shape: it is already what a failed provider call
writes today, so this design reaches an existing shape by a new route.

**ADR-095's Decision Outcome STANDS UNCHANGED.** `expected_count` still spans every billable
row, `unmeterable_count` is still carried alongside, and the window still records both. What
this record replaces is the RULE FOR DECIDING such a window, not what the window stores.

### The replacement ground, which is the substance here

ADR-095 rejected recording nothing because "the window is never compared against the
provider at all, so if the exclusion later regresses at the delivery query alone, those rows
reach the meter and nothing notices." **The last four words are false, and correcting them
is what licenses this decision.**

If the exclusion regresses at the delivery query, those rows are SENT, and sending sets
`meter_state = 'delivered'`. So `delivered_count` rises above zero on a window where every
row is unmeterable, which is a LOCAL CONTRADICTION: the service recorded that it owed
nothing and simultaneously recorded that it delivered something. That is detectable with no
provider call, immediately, and without the provider's own reporting lag. The call would
have caught the same regression later and less directly.

The contradiction is reachable ONLY by regression, and the reason is stronger than "the
delivery query is the only sender". An unmeterable row can never be VISIBLE to the delivery
query in an unmarked state, because ADR-092 requires the marker to be written inside the
same `FINALIZE_SQL` UPDATE that promotes the row to `billable`. The row becomes selectable
and becomes marked atomically. There is no window in which it is one but not the other.

**ADR-092's statement-budget rule is therefore load-bearing for a SECOND reason it does not
state.** It requires the marker write to stay inside `FINALIZE_SQL` to keep within a ratified
statement ceiling. It now also keeps this detector sound: split the marker write out and a
deliver-then-mark interval opens, and the local contradiction becomes reachable benignly,
turning a control into a false alarm. Recorded here because the second reason lives nowhere
else and an implementer weighing the first alone might trade it away.

### Two mechanism corrections, both found by review before anything was built

**The equality test gates the CALL, not the state machine.** A first draft of this design
guarded `reconciliationState`'s `delivered_count < expected_count` branch on
`expected_count == unmeterable_count`. That is wrong and redundant: ADR-095 already requires
the subtraction on BOTH branches, which makes that branch compare zero against zero for an
all-excluded window and return false on its own, AND which correctly handles the partial
window the equality guard misses entirely. A second mechanism holding a property the first
already holds is the dead-predicate failure ADR-095 spends a paragraph warning about. The
equality test belongs in exactly one place: deciding whether to call the provider.

**The decision routes THROUGH `reconciliationState`, not around it.** Short-circuiting before
it would drop the `rejected_count > 0` branch, which all-excluded windows satisfy only as a
derived property, and would delete the mutation target ADR-095's confirmation criterion 4
names by hand.

### The requeue guard, pinned because it is currently correct by accident

A locally-decided `mismatched` window MUST NOT reach `requeueDeliveredUsage`. Today it does
not, but only because `providerCount` is left `undefined` and `undefined < delivered_count`
evaluates false. **That is an accident one keystroke from breaking.** An implementer who
initialises `let providerCount = 0` — a natural tidy-up, and one that also stops `?? null`
producing NULL — flips the comparison true, fires the requeue, and returns those rows to
`pending`, where the delivery query will refuse them forever. They then sit pending, and
`delivery_overdue` goes permanently red on rows nobody can clear. That is the dead end
ADR-095's write-once invariant already names, reached by a different door.

The guard must be EXPLICIT, not inherited from JavaScript comparison semantics, and it owes
a mutation test that initialises `providerCount = 0` and must red.

## The residual, stated as a narrowing rather than argued away

A first draft of this record claimed the remaining gap was purely pre-existing. **It is not,
and the honest form is still the winning argument.**

Phantom detection — the provider reporting usage the service never sent, from a source that
is not this delivery path — covers org-hours with at least one BILLABLE row today. Under this
decision it covers org-hours with at least one METERABLE row. That is a strict narrowing by
exactly one class, the all-excluded window, which is the class the call was buying.

Accepted, for three reasons:

- The uncovered class is already the overwhelming majority. An organisation with no traffic
  in an hour produces no group and therefore no provider call today, and for any real
  subscriber most hours are like that. The marginal loss is at most one window per
  organisation per billing period, by ADR-095's own derivation.
- What is retained is better targeted, not merely cheaper. The local check fires with no
  provider lag, and it fires on ROLLBACK too: deploy release 1's Worker over release 2's and
  the excluded rows get delivered, `delivered_count` rises, and the window goes mismatched
  loudly.
- **Neither design provides a class-level phantom control.** That would be a per-organisation
  sweep of provider summaries with no local anchor, which is a different control entirely.
  The empty-window call closed an arbitrary slice, not the class.

## Consequences

- Good: the failure ADR-095 cared about is caught earlier and more directly than the call
  caught it, and without depending on provider reporting lag.
- Good: no provider call on a path with no budget, which is what the maintainer asked for.
- Good: `provider_count` NULL is an existing shape, so no consumer changes. There is in fact
  no reader of that column anywhere in the repository today.
- Bad: phantom-event coverage narrows by one class, stated above and accepted.
- Bad: the design's soundness now depends on ADR-092's marker-inside-`FINALIZE_SQL` rule for
  a reason that rule does not give, so a future implementer could trade it away without
  seeing the cost. Mitigated only by this record saying so.
- Neutral: the per-request path is untouched. ADR-080's envelope is unaffected.
- Neutral: problem 147's ungoverned scheduled path stays open. This decision resolves one
  cost question without giving the path an instrument, so the next such cost arrives with
  the same instrument missing.

## Confirmation

1. An all-excluded window reconciles to `matched` with `provider_count` NULL and with NO
   provider call made, asserted by a test that fails if the provider client is called at all
   rather than by inspecting the result.
2. An all-excluded window with `delivered_count > 0` reconciles to `mismatched`,
   mutation-proved by removing the exclusion predicate from the delivery query, which must
   produce exactly that state. This is the criterion that replaces ADR-095's provider
   comparison, so it is the one that carries the superseded ground.
3. **The requeue does not fire on a locally-decided mismatched window**, mutation-proved by
   initialising `providerCount = 0`, which must red. Asserted directly, not inherited from
   `undefined` comparison semantics.
4. A PARTIAL window — some rows meterable, some excluded — still calls the provider and still
   reconciles by subtraction, so the local route does not swallow the ordinary case.
   Mutation-proved by widening the equality test to a comparison that also matches partial
   windows, which must red.
5. ADR-095's criteria are otherwise unchanged and still owed, except that its criterion 3's
   instruction to mutate "each of `reconciliationState`'s two branches" has no second target
   in the all-excluded case, where the provider comparison no longer runs. The partial case
   in criterion 4 above is where that mutation now lands.
6. NOT confirmable here and stated rather than implied: that no source other than this
   delivery path can write to the meter. Nothing in this repository can establish that, and
   the narrowing above is the reason it matters less than it would otherwise.

## Superseded clauses, two, enumerated exactly

Enumerated rather than counted, because the `supersedes-clause` scalar in this record's
frontmatter is free text that no check resolves to a location.

1. **ADR-095's empty-window matching rule.** Its chosen option reads: "Keep `expected_count`
   over all billable rows and carry the exclusion as data, adding `unmeterable_count` to
   `meter_reconciliations`, **with a window matching when the provider count equals
   `expected_count - unmeterable_count`.**"

   What is superseded is the bolded clause, and ONLY for the case where every billable row in
   the window is excluded. For a PARTIAL window the provider comparison is unchanged and
   still runs. What the window stores is unchanged. ADR-095 is ratified, so this is a clause
   supersession rather than an edit, and ADR-095 itself is unchanged.

2. **ADR-095's ground for rejecting option 5.** It reads: "Cheapest, and it trades a
   permanent false alarm for a permanent blind spot. The window is never compared against the
   provider at all, so if the exclusion later regresses at the delivery query alone, those
   rows reach the meter and **nothing notices.**"

   The conclusion survives: option 5 is still rejected, because this record still writes the
   reconciliation row. What is superseded is the GROUND. Something does notice — locally,
   and sooner. Scoped this way because ADR-049 makes the inferential step itself substance:
   the ratifier agreed to the conclusion on that ground, and the ground has moved even though
   the conclusion has not.

## Reassessment Criteria

Reassess if a source other than the delivery path gains the ability to write to the meter, in
which case the local contradiction stops being the only route to a phantom event; if a
class-level phantom control is built, which would make the narrowing above free; if the
scheduled path gains a performance budget, which would let a future version of this question
be settled without asking the maintainer; or if the marker write ever moves out of
`FINALIZE_SQL`, which would falsify this design's soundness ground rather than merely its
cost.

## Related

- ADR-095 — the record this completes, and the two clauses superseded above.
- ADR-092 — the exclusion itself, and the marker-inside-`FINALIZE_SQL` rule that this
  decision's soundness now depends on for a reason that rule does not state.
- ADR-091 — the charge point, whose in-flight overshoot is the entire excludable set.
- ADR-049 — the amendment boundary that routes this to a new record rather than an edit,
  specifically its rule that the ground on which an option was rejected is substance.
- ADR-080 — the per-request envelope, untouched here.
- JTBD-403 (Know the paid channel still bills correctly) — the job whose second outcome
  requires an intentional gap to be distinguishable from a metering failure at every
  instrument, which this decision keeps true by a cheaper mechanism.
- Problem 147 — the ungoverned scheduled path, which this decision does not close.
