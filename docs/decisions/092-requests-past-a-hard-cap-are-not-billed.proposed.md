---
status: 'proposed'
date: 2026-09-06
human-oversight: confirmed
oversight-date: 2026-09-06
decision-makers: [Tom Howard]
consulted: [wr-architect:agent, wr-jtbd:agent]
informed: []
supersedes-clause: 091#outcome-overshoot-favours-customer, 071#confirmation-billable-implies-metered
reassessment-date: 2026-12-06
---

# Requests past a hard cap are not billed

## Context and Problem Statement

ADR-091 moved the quota charge from reserve-time to settle-time and accepted, as its
stated cost, that simultaneous requests can exceed a hard limit by roughly the number in
flight. It described that overshoot as erring in the customer's favour.

That description is not supported by the code. Meter delivery selects every `billable`
usage row with no reference to `quota_limit` and no per-plan gate, so an overshoot
request is delivered to the Stripe meter exactly like an in-allowance one. Whether it
reaches an invoice turns on whether a hard-cap price carries a chargeable tier above its
allowance — a confidential catalogue term correctly absent from this repository, and not
read back. So the favourable reading was reasoned and the opposite reading, over-billing
past a ceiling the customer bought, was equally available from the same evidence.

Found by an adversarial review on 2026-09-06, before activation and before any subscriber
exists. Prospective in the strict sense: the channel has never been activated and the
commercial tables were empty at the 2026-09-03 readback.

## Decision Drivers

- A hard cap is sold as a cap. A customer who sets one is buying a ceiling, and billing
  past it is the opposite of what they bought — not a favour.
- The gap is between a record and the code, not between two designs. ADR-091 already
  tells a reader the overshoot favours the customer; the cheapest way to make that record
  true is to make the code match it.
- Free now. No subscriber, no invoice, no live meter event.
- It must not be settled by reading Stripe. Even if hard-cap prices carry no chargeable
  tier today, that is a provider setting someone can change without touching this
  repository, and the property would then break silently.

## Considered Options

1. **Exclude overshoot rows from meter delivery. Chosen.** A request served past a hard
   cap is recorded and counted but never metered, so it cannot reach an invoice whatever
   the price is configured to do.
2. **Bill them; the customer used them.** Rejected by the maintainer on 2026-09-06.
   Honest about consumption, but it needs the plan wording to say a cap can be exceeded
   and charged, which is a worse product than the one being sold.
3. **Read the Stripe price configuration back and rely on there being no chargeable tier.**
   Rejected: it makes a customer-facing guarantee depend on a mutable provider setting
   that no check in this repository watches. It is also the weaker form of option 1 —
   same outcome today, no guarantee tomorrow.
4. **Reuse an existing `meter_state` value instead of adding a column — the cheap
   one-release shape.** Setting `meter_attempts` to its maximum, or `meter_state` to
   `delivered`, at settle would satisfy both current delivery predicates with no migration
   at all, in one release. **Recorded because it is the obvious fix and the next reader
   will draft it.** It is wrong: it corrupts the very counts reconciliation compares, and
   it makes an intended exclusion indistinguishable from a delivery failure — so the first
   real metering fault after it ships would be read as a comped request. It also does not
   solve the reconciliation and health-reader problem, only hides it in a way that later
   reads as data corruption rather than as a design.
5. **Make the cap exactly hard so no overshoot occurs.** This is ADR-091's rejected
   option 4, and the grounds it was rejected on have not changed: counting precisely
   costs work proportional to requests already made in the period, and bounding the
   in-flight window needs an origin-fetch timeout that does not exist.

## Decision Outcome

Chosen: **option 1**, decided by the maintainer on 2026-09-06 when the question was put
plainly. A request served past a hard cap is recorded as billable and counted against the
organisation, so accounting stays truthful about what was served, but it is not delivered
to the usage meter and therefore cannot be charged.

Accounting and billing deliberately part company here for a bounded set of rows. That is
the point: the counter should say what happened, and the invoice should say what was
agreed.

## THIS DECISION IS NOT YET IMPLEMENTED, and the sequencing is the hard part

Recorded before the code so the intent is not lost, and stated plainly so nobody reads
this record as a description of production. Until it lands, the code and this decision
disagree, and the launch-readiness ledger's hard-limit boundary gate is the tracking site.

**The exclusion must be read at FOUR sites, not one.** An adversarial review on
2026-09-06 found that a first draft of this record named only the delivery query, and that
that alone would have made the managed-channel health reader permanently red. An excluded
row keeps `outcome = 'billable'` and `meter_state = 'pending'` forever, and four
statements must account for it — the one that would send it, and three that read exactly
that shape as a fault:

- the meter delivery query, which would otherwise send it;
- the reconciliation group query, whose `expected_count` is `COUNT(*)` over billable rows
  in the window, so `delivered_count < expected_count` holds forever and the window never
  leaves `pending`;
- the health reader's `delivery_overdue`, which fires on any billable row still pending
  past its cutoff;
- the health reader's `reconciliation_pending`, which fires on any window left pending by
  the point above.

A design that trips a ten-minute alarm forever on a condition it created is worse than the
defect it fixes, and it defeats the job this decision serves — a reader that is always red
tells nobody anything. Every one of the four must exclude the row.

The change needs BOTH a new column on `usage_records` marking a row unmeterable AND a
predicate on the four statements above. **Those cannot ship in the same release**, and the half that forces it is the REQUEST
PATH, not the background one. The marker has to be WRITTEN at settle, which is
`FINALIZE_SQL` in `customer-channel.mjs`. A Worker whose settle statement names a column
the schema lacks fails into `settleUsage`'s catch, and the Worker answers
`usage_store_unavailable` — customer-visible 503s on requests the origin already served,
and those requests go unbilled. That is why the sequencing is not a preference.
`deploy.sh` applies Terraform, which deploys the Worker, before applying D1 migrations, so
a Worker referencing a column the schema does not yet carry would fail meter delivery for
the window between them. Migration first, Worker second, two releases. This is the first
real consequence of the ordering invariant recorded in ADR-093.

A new column is preferred to a new `meter_state` value for three reasons, of which the
cost is the weakest. `meter_state` carries a `CHECK` constraint, and SQLite has no
`ALTER TABLE` form that modifies one, so widening means the full rebuild — worse on
`usage_records` than the precedent on `entitlements`, because of two restricted foreign-key
references, two indexes and two triggers to recreate on the append-only commercial ledger.
More decisive: **a rebuild is not additive, so ADR-093's invariant forbids it** without a
recorded reason, where `ALTER TABLE ADD COLUMN` satisfies that invariant by construction.
And most decisive: widening would not even buy the single release it appears to, because a
Worker writing the new value against the old CHECK fails the settle UPDATE — the same
customer-visible failure described above. The column must be `NOT NULL DEFAULT 0` or
nullable, so the migration is safe on its own against the live Worker; verified that
nothing does `SELECT *` on `usage_records` and that the reserve statement names its columns
explicitly, so a live Worker ignores it safely.

## Statement budget — ADR-080, which an earlier draft of this record did not cite

ADR-080 caps a managed request outcome at three D1 statements and 4 KiB, and ADR-091 was
careful to record that it left the count unchanged. This record changes the settle
statement, so it owes the same accounting.

**The marker must be computed INSIDE the existing `FINALIZE_SQL` UPDATE**, as a correlated
primary-key lookup on `entitlements` — the same shape ADR-091 used for the reserve gate.
That is +0 statements, +1 indexed row read, +0 response bytes, and it PASSES the envelope.
Composed instead as a read followed by an update it is three statements becoming four, a
breach of a ratified ceiling. The record says which because the difference is invisible
once the code is written and the wrong one still looks correct.

One ordering trap worth pinning: the settle trigger increments `quota_used` AFTER the
UPDATE, so the comparison must be against the PRE-increment value — `quota_used >=
quota_limit` — or the first request past the cap is billed and only the second is excluded.

The delivery, reconciliation and health statements are on the scheduled path, which ADR-080
does not govern and which problem 147 records as ungoverned.

## What the maintainer was asked, and what this record adds

Recorded because the ratification marker attests to what they saw, and this record carries
more than the question did. Following ADR-051's own header, which draws the same line.

**Asked and answered on 2026-09-06:** whether requests served past a hard cap should be
billed. The answer was no. That settles options 1 and 2 and nothing else.

**This record's own additions, not theirs:** the rejection of option 3 (relying on a
Stripe readback) and of option 4 (reusing an existing `meter_state` value); the two-release
sequencing; the column shape; the four read sites; and the clause supersessions above.
Each follows from the answer or from an existing ratified decision, and each is argued
here rather than asserted.

**One addition is a fresh acceptance rather than a consequence**, and is flagged so it is
not taken as chosen: that `quota_used` exceeding `quota_limit` becomes a permanent state
rather than something a future exact-cap design would remove, with the customer-visible
"3 of 2" that follows. Nobody was asked about that. It should be put to the maintainer
before the account surface is built, and JTBD-005 has no outcome covering quota display,
so nothing else will force the question.

## Consequences

- Good: the customer-facing guarantee holds by construction rather than by a provider
  setting nobody watches, and ADR-091's claim that the overshoot favours the customer
  becomes true instead of hopeful.
- Good: the property survives a price being reconfigured in Stripe, which is exactly the
  failure option 3 would have left open.
- Bad, and CONTINGENT on the same unread term the rest of this record is careful about: revenue MAY be forgone on requests that were served. If a hard-cap price carries no chargeable tier above its allowance then nothing is forgone and this bullet costs nothing. Bounded by in-flight concurrency,
  so small, and it is the cost of selling a cap that means what it says.
- Bad: `quota_used` can exceed `quota_limit` and nothing clamps it, so a usage panel can
  render "3 of 2" and a client computing `limit - used` goes negative. Inherited from
  ADR-091, not created here, but this decision makes the state permanent rather than
  something a future exact-cap design would remove.
- Bad: four statements must agree about the exclusion, not one. Any that is missed
  reintroduces either the billing the decision forbids or the permanent alarm described
  above. This is the cost of expressing the exclusion as data rather than as a new
  `meter_state`, and it is the reason the confirmation criteria below test the silence of
  the health reader rather than only the delivery query.
- Neutral until implemented: no runtime behaviour changes on the strength of this record.

## Confirmation

1. A behavioural test against real D1 proves a request served past a hard cap is recorded
   billable, counted, and NOT selected by the meter delivery query. Mutation-proved by
   removing the exclusion predicate.
2. The same test proves an in-allowance request IS still selected, so the exclusion does
   not swallow ordinary traffic.
3. A soft-limit or pay-per-use organisation is unaffected: every billable row is still
   delivered, because the cap being hard is what makes a row excludable.
4. **An excluded row leaves the instruments silent.** A window containing one reconciles to
   `matched` rather than sitting `pending` forever, and the health reader raises neither
   `delivery_overdue` nor `reconciliation_pending` on its account. Mutation-proved by
   omitting the exclusion from the reconciliation group query and from the health query
   independently, each of which must red on its own — a single combined case would pass
   while one of the two was still wrong.
5. The two releases are proved to be independently safe — the migration alone against the
   live Worker, and the new Worker against the migrated schema. The evidence goes in the
   launch-readiness ledger's measured rollback section, whose method is already
   established there. That section will need a third measurement when this ships: it
   currently records that a rolled-back pre-0003 Worker "serves past a hard limit while
   still billing accurately for what it served", and after this decision that sentence
   describes billing for exactly what must not be billed.
6. Not confirmable from this repository, and stated so rather than left implied: whether
   hard-cap prices carry a chargeable tier above their allowance. This decision is
   deliberately built so that the answer does not matter.

## Superseded clauses — two, enumerated exactly

Enumerated rather than counted, because the `supersedes-clause` scalar in this record's
frontmatter is free text that no check resolves to a location. ADR-090 and ADR-089
enumerate theirs for the same reason.

1. **The customer-favourable reading of the overshoot.** ADR-091's Decision Outcome says
   of the accepted concurrency cost: "it errs in the customer's favour."

   **What is superseded is the sentence as an ASSERTION ABOUT THE SYSTEM AS BUILT, not as
   a statement of design intent.** The distinction matters and an earlier draft of this
   record missed it: as intent the sentence is right, and this decision exists to make it
   true. As a description of the deployed system it was false on the day it was written,
   because meter delivery has never referred to the plan's limit. Scoping it this way is
   what stops the badge on ADR-091 reading wrong forever from the day this ships.

   The hedge in ADR-091's own Consequences does not make the supersession unnecessary.
   The compendium — which ADR-077 makes the routine load surface, and which is what a
   reviewer actually reads — renders the unqualified claim in ADR-091's Decides line and
   excludes Consequences from that view entirely. So the false form is live on the surface
   people read and the retraction is not.

   ADR-091 is ratified, so this is a clause supersession rather than an edit, and ADR-091
   itself is unchanged. Its charge-at-settle outcome stands entirely.

2. **ADR-071's identity of billable with owed-to-the-meter.** Its confirmation criterion
   5 reads: "Non-billable and abuse-rejected requests do not emit meter events." The list
   is exhaustive by construction — it names the only two classes excused from emitting,
   so everything billable is owed. Criterion 4, "Reconciliation reports missing, rejected
   and mismatched events and can retry them safely", inherits that: a deliberately
   unmetered row is _missing_ under the old identity and would be reported and retried.

   This record creates a third class — billable, counted, deliberately never metered —
   which neither criterion has vocabulary for. What is replaced is the exhaustiveness of
   criterion 5's list and criterion 4's treatment of an absent event as necessarily a
   fault. Everything else in ADR-071 stands: the request path still contains no
   synchronous meter call, one authoritative identity per billable request, and replay
   still cannot double-count.

   ADR-071 is ratified, so this is a clause supersession rather than an edit.

## Reassessment Criteria

Reassess if an exact hard cap becomes cheap (an origin-fetch timeout is introduced, or the
store gains a cheap precise count), if forgone revenue proves material once traffic is
real, or if a plan is introduced whose cap is explicitly best-effort rather than a
ceiling.

## Related

- ADR-091 — the charge point, and the clause superseded above.
- ADR-093 — the deploy ordering invariant that forces this into two releases.
- ADR-086 — launch parity with the current RapidAPI catalogue, which makes hard-versus-soft
  limit behaviour a parity item. Nobody has established what RapidAPI does at the boundary,
  so parity remains open independently of this decision.
- JTBD-403 (Know the paid channel still bills correctly) — the job whose statement names
  over-billing first among the things that must not happen. Its second desired outcome —
  that local usage disagreeing with the provider's record is a fault in either direction —
  did not admit an intentionally unmetered row. That carve-out was put to the maintainer as
  a plain question on 2026-09-06 and confirmed, and the outcome now carries it: a
  divergence the service deliberately chose is not a fault, and an instrument that cannot
  tell an intentional gap from a metering failure fails the outcome either way. Recorded
  here because this record is what forced the question.
- JTBD-005 (Create and access a managed hosted API account) — the customer job that owns
  the account surface. The unclamped counter in the Consequences above renders there, and
  none of that job's outcomes currently covers quota display, so the "3 of 2" state is
  permitted by omission rather than by decision.
- The managed-channel launch-readiness ledger — the hard-limit boundary gate tracks the
  gap between this record and the code.
