---
status: 'proposed'
date: 2026-09-18
human-oversight: confirmed
oversight-date: 2026-09-18
decision-makers: [Tom Howard]
consulted: [wr-architect:agent]
informed: []
supersedes-clause: 092#four-read-sites, 092#confirmation-4
reassessment-date: 2026-12-18
---

# An unmeterable row is excluded wherever billable implies owed

## Context and Problem Statement

ADR-092 excludes a request served past a hard cap from metering. Such a row keeps
`outcome = 'billable'`, `meter_state = 'pending'` and `meter_attempts = 0` forever, so
every statement that reads that shape must account for it. ADR-092 says, emphatically,
that the exclusion "must be read at FOUR sites, not one", and names them.

The number is wrong, and the reason it is wrong is more useful than the correction.

Found on 2026-09-18, while implementing ADR-092 and before any of it shipped. Two further
sites exist, and they are not simply two more of the same kind:

- `oldestUnreconciledWindow` selects the next window for the reconciler's catch-up slot.
  It is not an alarm and not a sender. It is a SCHEDULING INPUT, and ADR-092's taxonomy
  ("the one that would send it, and three that read exactly that shape as a fault") has no
  category for one.
- the health reader's `reconciliation_missing`, which is a fault reader of exactly the kind
  ADR-092 enumerated, and was simply missed. The health reader carries five flags and
  ADR-092's confirmation criterion 4 names two.

That second one is the sharper finding, because it means **ADR-092's confirmation criterion
4 is satisfiable by a broken implementation**. Criterion 4 requires silence on
`delivery_overdue` and `reconciliation_pending`. An implementation can satisfy it exactly
and still leave the reader permanently red on `reconciliation_missing`, which is the
outcome criterion 4 exists to prevent. A criterion that passes the thing it forbids is
worse than no criterion, because it is trusted.

The house test style would probably have caught it anyway: the existing D1 suite asserts
whole-array equality on the findings list rather than membership. That is a stronger
practice than ADR-092's criterion, and it is luck rather than design. A criterion that
works only because the author happens to write exhaustive assertions is not a criterion.

## Reachability, the first reading was wrong and why it was tempting

An earlier draft of this record claimed an organisation past its cap has every subsequent
request excluded, so every subsequent hour window contains only excluded rows, making this
"the steady state after a cap is hit". **That is false and is recorded here because it is
the tempting reading.** The reserve gate refuses once `quota_used >= quota_limit`, so past
the cap no usage row is created at all. The excludable set is exactly ADR-091's in-flight
overshoot, which ADR-092 itself calls bounded by concurrency and small. Windows key on
`created_at`, set at reserve, so overshoot rows almost always share a window with the
in-allowance rows they raced, that window does produce a group, and the two sites stay
quiet.

The real condition is narrower and worth stating precisely: **an hour boundary falling
between the last in-allowance reserve and the overshoot reserves that raced it.** At most
once per organisation per billing period, DERIVED from the reserve gate refusing once the
count reaches the limit and from the period reset, not observed. But permanent the first
time it occurs,
and thereafter silent at the scheduling site and permanently red at the reader. Rare cause
with permanent consequence is worth fixing; "steady state" would have been worth a bigger
fix than the defect needs, and would have inflated any risk score built on it.

The blast radius at the scheduling site is also narrower than it first appears. The
reconciler handles two windows per invocation: the current one unconditionally, and one
backlog window. So later windows keep reconciling as they become current. What dies is the
catch-up slot, pinned forever to a window it can never clear, so a window that took an
error state during a provider outage is never revisited. Permanent silent loss of the
repair path, not a halt of reconciliation.

## Decision Drivers

- A count drifts; a property does not. Six will be wrong the moment a seventh reader is
  added, exactly as four was wrong before this record was written.
- The instrument must be able to tell an intended gap from a metering failure. ADR-092
  rejected its own option 4 on precisely this ground and its JTBD-403 note says so plainly.
  An option that makes the window vanish commits the same error one level up: the
  instrument then cannot tell an intended gap from never having looked.
- Over-billing is the first thing the billing job says must not happen, so the design
  should keep the ability to detect the provider reporting usage the service never sent.
- Nothing has shipped. The channel has never been activated and the commercial tables were
  empty at the 2026-09-03 readback, so all of this is prospective.

## Considered Options

For the exclusion rule:

1. **State the property and guard it mechanically. Chosen.** Every statement that treats
   `billable` and not-yet-delivered as an obligation, a fault, or a scheduling input must
   exclude unmeterable rows. A test enumerates the SQL literals that reference
   `outcome = 'billable'` and requires each to carry the exclusion or appear in a named,
   justified exempt list.
2. **Correct the count to six.** Rejected: it is the same defect with a bigger number, and
   the next site is found the same way these two were, by someone happening to look.

For what an all-excluded window records, put to the maintainer on 2026-09-18:

3. **Keep `expected_count` over all billable rows and carry the exclusion as data**, adding
   `unmeterable_count` to `meter_reconciliations`, with a window matching when the provider
   count equals `expected_count - unmeterable_count`. **Chosen by the maintainer.**
4. **Write a reconciliation row with `expected_count = 0`.** Rejected: keeps the
   phantom-event detection but leaves no positive record that the gap was deliberate, so a
   later reader cannot distinguish an intended exclusion from a window nobody looked at.
5. **Record nothing for the window.** Rejected: cheapest, and it trades a permanent false
   alarm for a permanent blind spot. The window is never compared against the provider at
   all, so if the exclusion later regresses at the delivery query alone, those rows reach
   the meter and nothing notices. That is the exact mutation ADR-092's confirmation
   criterion 1 exists to catch, and this option would make it undetectable in production.

## Decision Outcome

Chosen: **option 1 for the rule, and option 3 for the empty window**, the latter decided by
the maintainer on 2026-09-18 when the three were put to them plainly.

**THE RULE IS THE GUARD, NOT A TAXONOMY.** Every statement that treats `billable` as
implying owed must ACCOUNT FOR the exclusion, and confirmation criterion 1 below is what
enforces it. The guard admits no taxonomy, which is the point: a category list drifts
exactly as a site count drifts, and an earlier draft of this record proved it by offering
three categories that do not close. A statement that REPORTS billable rows to a person as
what they were charged fits none of the three, and must still account for the exclusion or
it tells a customer they were billed for a request the design guarantees was never metered.
That is not hypothetical: the customer-visible request logs gate is ordered before
activation and will add exactly such a statement.

The categories below are kept as EXPLANATION of why the sites differ, not as the rule:

- **SENDS it.** A statement that would deliver the row to the meter.
- **READS it as a fault.** A statement that treats the row's permanent shape as evidence of
  a delivery or reconciliation failure.
- **SCHEDULES work from it.** A statement that selects what to process next. ADR-092 had no
  name for this kind.
- **REPORTS it as owed.** A statement that presents billable rows to a person as what was
  charged. None exists yet, and the request-logs gate will create the first. That gate's own
  FIRST prerequisite is a documented customer job covering what a customer may see about
  their own usage, and no such job exists. So the first statement in this category is
  blocked on a corpus gap, not on this record, and an implementer arriving here rather than
  at the gate should meet that prerequisite before writing the statement.

A missed site that sends reintroduces the billing this decision forbids. A missed site that
reads reintroduces the permanent alarm. **A missed site that schedules reintroduces
neither: it reintroduces silence**, which is why enumerating alarms could not have caught
it. A missed site that reports tells the customer something untrue.

**ACCOUNTING FOR IT DOES NOT MEAN A PREDICATE EVERYWHERE, and the difference is invisible
once the code is written.** Under the chosen option the reconciliation group query
deliberately keeps `expected_count` over ALL billable rows and carries the exclusion
alongside as `unmeterable_count`, so THREE of the six sites are discharged by a
reconciliation row EXISTING and reaching `matched`, not by any predicate of their own. An
implementer reading "exclude at six sites" would add three predicates that hold nothing,
and would then have nothing to mutate when proving them.

**THE BRANCH THAT ACTUALLY CAUSES THE PERMANENT ALARM.** `reconciliationState` tests
`delivered_count < expected_count` FIRST and returns `pending`. For an all-excluded window
that comparison is zero against a positive count, so the window sits pending forever and
the reader is permanently red, which is the exact failure this record exists to prevent,
unless THAT branch subtracts the unmeterable count too and not only the matched comparison.
Pinned here because both branches must change and the wrong one still looks correct. It is
the same trap ADR-092 pinned for its own settle statement.

## The six sites as of 2026-09-18, which is a snapshot and not the rule

Recorded so the next reader can check the guard rather than trust it, and dated because a
list of sites is exactly the mutable thing this record refuses to make load-bearing.

| Statement                             | Category       | How it accounts                                    | In ADR-092 |
| ------------------------------------- | -------------- | -------------------------------------------------- | ---------- |
| meter delivery selection              | sends          | its own predicate                                  | yes        |
| reconciliation group `expected_count` | reads as fault | arithmetic in `reconciliationState`, BOTH branches | yes        |
| health `delivery_overdue`             | reads as fault | its own predicate                                  | yes        |
| health `reconciliation_pending`       | reads as fault | discharged: the window reaches `matched`           | yes        |
| health `reconciliation_missing`       | reads as fault | discharged: a reconciliation row exists            | **no**     |
| `oldestUnreconciledWindow`            | schedules      | discharged: the window reaches `matched`           | **no**     |

Only TWO predicates and one piece of arithmetic are written. The other three sites need no
code at all, and adding a predicate to any of them would be dead.

Three statements are deliberately NOT excluded, and each is recorded with the reason,
because an unexplained absence reads as an oversight:

- health `delivery_exhausted` fires on `meter_attempts >= MAX`. An excluded row is never
  selected by the delivery query, so its attempts stay at zero and the flag cannot fire.
- `requeueDeliveredUsage` requires `meter_state = 'delivered'` and `requeueRejectedUsage`
  requires `meter_attempts >= MAX`. An excluded row reaches neither state. Note the reason
  is ROW STATE, not scoping: both sweep by organisation and window rather than by an id
  list, so they do reach rows the group query never counted.

That last point yields an invariant this record pins: **the marker is written once at
settle and never applied retroactively.** If a backfill ever marked an
already-delivered row, `requeueDeliveredUsage` would return it to pending, the delivery
query would then refuse it, and it would sit pending forever, re-entering
`delivery_overdue` by a path none of the six sites covers.

`meterReconciliation` is a seventh statement over the same rows and is excluded from the
rule because it has no caller anywhere in the repository. Under ADR-051, a check with no
reader at all is further from being a control than the probe that decision deleted. It
should be given a reader and grouped by the marker, or removed. Not settled here.

## Consequences

- Good: the rule survives a seventh reader being added, which the count did not.
- Good: an all-excluded window still records what it expected and what it deliberately did
  not, so the provider reporting usage the service never sent is still detectable. That is
  over-billing, which the billing job names first among the things that must not happen.
- Good: the exclusion is visible in the instrument rather than inferred from an absence.
- Bad: one provider summary call per organisation per otherwise-empty window, on the
  scheduled path, bounded by the reachability above at most once per organisation per
  billing period, and flagged above as an acceptance nobody was asked about. **The scheduled path carries
  no performance budget** — ADR-080 governs the per-request outcome only, and problem 147
  already records the scheduled path as ungoverned. Accepted here rather than left implied.
- Bad: a second column on `meter_reconciliations`, and `storeReconciliation`'s column list
  changes with it.
- Neutral: the per-request settle path is unchanged by this record. ADR-092 already
  accounted for it at +0 statements and +1 indexed row read.

## THIS DECISION IS ONLY PARTLY IMPLEMENTED, and the sequencing is ADR-092's

Stated plainly so nobody reads this record as a description of production, the mistake
ADR-092 guarded against in the same words.

Written and merged 2026-09-18, and NOT APPLIED to production: migration 0004, which adds
the marker column on `usage_records` and the `unmeterable_count` column on
`meter_reconciliations`. Both are additive and both default to nothing-excluded, so the
migration alone changes no behaviour and excludes nothing. A `PRAGMA table_info` readback
on production D1 remains owed after the apply, because an applier's own report is not a
schema readback. Confirmation criterion 6's first half is proved at the strength that
criterion now states; the rest are not.

Not shipped: the settle-time write of the marker, the exclusion predicate at any of the six
sites, the reconciliation arithmetic that subtracts the unmeterable count, and the
mechanical guard of criterion 1. Until those land, the code and both this record and
ADR-092 disagree, and the launch-readiness ledger's hard-limit boundary gate is the
tracking site.

## Confirmation

1. A test enumerates every SQL literal referencing `outcome = 'billable'` across the
   gateway and the health script, and requires each to carry the exclusion or to appear in
   a named exempt list carrying its reason. It must fail when a new unexcluded site is
   added, proved by adding one. This replaces the four-site enumeration, which could only
   ever certify the sites someone had already thought of.
2. The test carries a zero-match guard, so it cannot pass by finding nothing.
3. An excluded row leaves ALL FIVE health flags silent, asserted by whole-array equality
   rather than by membership. Mutation-proved against the MECHANISM that holds the property
   at each site rather than against a predicate the site does not have: remove the delivery
   predicate, remove the `delivery_overdue` predicate, and remove the `unmeterable_count`
   subtraction from EACH of `reconciliationState`'s two branches. Each must red on its own,
   because a single combined case passes while the others are still wrong.
4. A window whose billable rows are all excluded reconciles to `matched` with a recorded
   unmeterable count, and does not pin the catch-up slot. Mutation-proved by removing the
   subtraction from the `delivered_count < expected_count` branch alone, which must leave
   the catch-up slot pinned AND the reader red. No predicate is added at
   `oldestUnreconciledWindow` or at `reconciliation_missing`: both are discharged by the
   reconciliation row existing, so a defensive predicate there would hold nothing and could
   not be mutation-proved. A criterion a correct implementation cannot discharge is the
   inverse of the defect this record fixes, and rots the same way.
5. The marker is never set on an already-delivered row, asserted directly rather than
   inferred from the settle path being the only writer.
6. The two releases are independently safe: the migration alone against the deployed
   gateway, and the new gateway against the migrated schema. As of 2026-09-18 the first
   half is proved against the CURRENT WORKER SOURCE by a behavioural test that applies every
   migration, exercises the reserve and settle path end to end, and asserts the migration
   alone marks nothing, so it cannot switch billing off a release early. That the current
   source IS the deployed Worker was MEASURED on 2026-09-18, not reasoned: the Worker source
   tree is byte-identical between HEAD and `c8d7c2f5`, the revision the last applying release
   deployed from, so the diff is empty. Scoped honestly, that is a source-revision
   comparison and NOT a readback of the deployed bundle: it assumes that release deployed
   what its source said. The remaining unapplied change in the deployment tree is
   comment-only in `main.tf` and has no plan effect.

## What the maintainer was asked, and what this record adds

Following ADR-092's own header, which draws the same line, and ADR-051's.

**Asked and answered on 2026-09-18:** what an all-excluded window should record. The three
options were put with their costs, including that recording nothing trades a permanent
false alarm for a permanent blind spot. The answer was option 3, recording both what was
expected and what was deliberately excluded. That settles options 3, 4 and 5 and nothing
else.

**This record's own additions, not theirs:** the two further sites; the guard replacing
the count; the categories as explanation rather than rule; the write-once invariant; the
three deliberate non-exclusions and their reasons; and the clause supersessions below. Each
follows from the answer or from an existing ratified decision, and each is argued here
rather than asserted.

**One addition is a fresh acceptance rather than a consequence**, and is flagged so it is
not taken as chosen, following ADR-092's handling of its own unclamped-counter acceptance.
The three options were put with their costs, but the extra provider summary call per
otherwise-empty window, on a scheduled path that carries no performance budget, was NOT
among the costs put. Nobody was asked about it. It is small and bounded by the reachability
above, and the standing rule here is to ask before accepting an operational cost rather
than accept it in a record. It should be put to the maintainer before release 2 ships.

## Superseded clauses, two, enumerated exactly

Enumerated rather than counted, because the `supersedes-clause` scalar in this record's
frontmatter is free text that no check resolves to a location.

1. **ADR-092's four-site enumeration.** It reads: "**The exclusion must be read at FOUR
   sites, not one.**" and its Consequences restate it as "four statements must agree about
   the exclusion, not one."

   What is superseded is the CLOSURE of the list, not the obligation. Every site ADR-092
   names is still obliged to exclude. What no longer holds is that those four are all of
   them, and the replacement is the property above rather than a longer list. ADR-092 is
   ratified, so this is a clause supersession rather than an edit, and ADR-092 itself is
   unchanged.

2. **ADR-092's confirmation criterion 4.** It reads: "**An excluded row leaves the
   instruments silent.** A window containing one reconciles to `matched` rather than sitting
   `pending` forever, and the health reader raises neither `delivery_overdue` nor
   `reconciliation_pending` on its account."

   The principle stands and this record strengthens it. What is replaced is the criterion's
   naming of two flags where the reader carries five, which made it satisfiable by an
   implementation that leaves the reader permanently red on a third. Criterion 3 above
   replaces it with whole-array equality over all five, and criterion 4 above adds the
   scheduling site, whose failure mode is silence and which no flag assertion can reach.

## Reassessment Criteria

Reassess if the scheduled path gains a performance budget and the per-empty-window provider
call has to be costed against it; if an exact hard cap becomes cheap, which would empty the
excludable set and make this record inert; or if a second exclusion class is introduced,
which the reason-code column shape already anticipates but which none of the six predicates
currently distinguish.

## Related

- ADR-092 — the exclusion this record completes, and the two clauses superseded above.
- ADR-091 — the charge point, whose in-flight overshoot is the entire excludable set.
- ADR-093 — the deploy ordering invariant that forces the two releases.
- ADR-080 — the per-request statement envelope, which governs the settle path and
  explicitly does not govern the scheduled path this record adds cost to.
- ADR-051 — a check whose only reader is the maintainer is not a control, which is why
  `meterReconciliation` is named above rather than quietly extended.
- JTBD-403 (Know the paid channel still bills correctly) — the job whose statement names
  over-billing first, and the reason the empty window is still compared against the
  provider rather than skipped.
- Problem 147 — the ungoverned scheduled path, which this record adds cost to and does not
  close.
- The managed-channel launch-readiness ledger — the hard-limit boundary gate tracks the gap
  between ADR-092, this record, and the code.
