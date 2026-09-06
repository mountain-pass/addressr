---
status: 'proposed'
date: 2026-09-06
human-oversight: confirmed
oversight-date: 2026-09-06
decision-makers: [Tom Howard]
consulted: [wr-architect:agent]
informed: []
supersedes-clause: 064#confirmation-concurrency-quota-transition, 064#outcome-hard-stop-stop-clause
reassessment-date: 2026-12-06
---

# Quota is charged at settle, not at reserve

## Context and Problem Statement

The gateway charged a customer's quota BEFORE calling the origin, by a trigger on
insert, and refunded it only when the reservation row was deleted. So a reservation
whose settle never completed — a transient D1 error, which the Worker models and
answers 503 to, or an isolate stopped between the two awaits — left the charge
standing forever.

The customer silently lost one request of their paid allowance, permanently, per
occurrence. Nothing detected it and nothing repaired it: entitlement reconciliation is
specified to PRESERVE same-period usage, and a behavioural test pins that. At the limit
they would meet `quota_exhausted` while genuinely under what they had paid for.

## Decision Drivers

- The loss is monotonic, silent, and on the revenue path.
- Charge-before-outcome is the only reason the residue exists. Anything that stops
  counting un-settled work removes the defect rather than collecting after it.
- The gate must stay cheap: it runs on every managed request.
- Free to change now. The channel is off and the commercial tables were empty at the
  2026-09-03 readback.

## Considered Options

1. **Charge at settle (chosen).** Read the counter to gate; increment it when the
   outcome is known billable.
2. **Sweep abandoned reservations.** Keep charge-at-reserve, collect stale rows on a
   schedule. **Rejected as worse than the defect** — see below.
3. **Derive the quota by counting billable rows, no counter.** The maintainer's first
   instinct, and correct about the cause. Rejected on cost: D1 does not maintain a count
   for you and Postgres is worse under MVCC, so this is work proportional to requests
   already made in the period — roughly the square of the allowance in rows read per customer per period,
   which D1 bills. The counter being removed IS the O(1) materialisation of that count.
4. **Count billable rows plus recent reservations.** Keeps the limit exactly hard.
   Rejected with option 3 on the same cost, and it additionally needs an origin-fetch
   timeout that does not exist to derive its window from.

## Decision Outcome

Chosen: **option 1.** The reserve statement gates on an EXISTS over entitlements and
moves nothing; triggers increment when a row becomes billable, by either route — the
settle path updating a reservation, or a direct billable insert. A reservation that
never settles costs nothing, so the defect cannot occur.

**The accepted cost, chosen by the maintainer on 2026-09-06 against option 4.**
Simultaneous requests each read the pre-increment count, so a hard limit can be exceeded
by roughly the number in flight. Bounded by concurrency rather than by anything in the
schema, and it errs in the customer's favour. A hard limit remains hard against
sequential requests, which is the case that governs a customer working through an
allowance rather than racing themselves.

## Why option 2 was worse than the defect

Recorded because it is the obvious fix and the next reader will draft it. A reservation
swept while its request is still in flight makes settle answer 503 for a request the
origin actually served — and that request goes unbilled too. A visible availability
failure in place of a silent accounting one, and the customer retries, so it compounds.
It also needed a staleness bound nobody could derive (the origin fetch carries no
timeout, so the in-flight window is bounded only by an unpinned provider default) and a
partial index to avoid scanning an unpruned table 288 times a day. Both of those
disappear rather than being solved.

Its period-straddle defect does NOT disappear. It inverts, and an earlier draft of this
record wrongly claimed it was gone. Under option 2 a row reserved in one period was
refunded against the next one's counter. Here the settle trigger increments
`WHERE organization_id = NEW.organization_id` with no period predicate, while
reconciliation resets `quota_used` to zero when `quota_period` changes — so a row
reserved in period P whose settle lands after the rollover charges P+1 for work done in
P. Accepted, and recorded in the Consequences below rather than fixed: the window is one
origin fetch rather than a sweeper interval, so it is orders of magnitude smaller. But it
runs AGAINST the customer, which is the wrong side of a billing error, and that is the
respect in which it is worse than the overshoot.

## Consequences

- Good: the defect is removed by construction. No sweeper, no staleness bound, no
  swept-then-settled response question, no new scheduled statement. The period straddle
  is NOT in that list; it inverts rather than going away, and is recorded as a cost
  below.
- Good: exhaustion now arrives as zero rows written rather than a raised error whose
  message had to be matched, so a refusal the store handled correctly is no longer
  reported as the store being unavailable.
- Bad: a hard limit can be exceeded by in-flight concurrency. Accepted above.
- Bad, and NOT yet established either way: what an overshoot costs the customer. Meter
  delivery selects every `billable` row with no reference to `quota_limit` and no
  per-plan gate, so an overshoot request is delivered to the usage meter exactly like an
  in-allowance one. Whether that reaches an invoice depends on whether a hard-cap price
  carries a chargeable tier above its allowance, which is a confidential catalogue term
  correctly absent from this repository and has not been read back. Until it is, "errs in
  the customer's favour" is REASONED, NOT MEASURED, and it inverts into over-billing past
  a ceiling the customer bought if that tier exists — which would breach the very job
  this record serves. Do not restate the favourable reading as settled anywhere outbound.
- Bad: a row reserved just before a period rollover charges the new period. See the
  straddle paragraph above.
- Bad, cosmetic: `quota_used` can now exceed `quota_limit`, and nothing clamps it. Both
  are returned raw to the account surface, so a panel can render "3 of 2" and any client
  computing `limit - used` goes negative.
- Neutral: `count_billable_insert` has no caller today. The reserve statement is the only
  insert into `usage_records` and it writes `reserved`, so the settle update is the sole
  route to billable. The trigger is retained deliberately, so that a future direct
  billable insert cannot go uncounted; it cannot double-fire with the update trigger
  because the two conditions are disjoint.
- Neutral: statements per request are unchanged at three. The gate's EXISTS is a
  primary-key lookup on entitlements inside the insert, not a second statement.

## Confirmation

1. A behavioural test against real D1 proves a reservation charges nothing, a settle
   charges once, a direct billable insert charges once, and deleting a settled row
   refunds nothing. Mutation-proved: returning the charge to reserve fails four cases.
2. The gate is proved by test to refuse a sequential request past a hard limit.
   Mutation-proved: removing the EXISTS guard fails three cases — a figure that only became
   meaningful once the test imported the statement instead of mirroring it; against a copy it
   reddened one.
3. The concurrency test asserts BOTH simultaneous reserves are admitted and that
   neither has charged, so the accepted overshoot is asserted rather than merely
   tolerated. That assertion inverted from the previous behaviour; the inversion is
   this decision and the test says so at the assertion.
4. The migration is proved to preserve a count already taken, so a customer mid-period
   does not regain allowance because the charge point moved.
5. Idempotent replay is unchanged: the primary key still rejects a duplicate identity.

## Superseded clauses of ADR-064 — two, enumerated exactly

Enumerated rather than counted, because the `supersedes-clause` scalar in this record's
frontmatter is free text that no check resolves to a location. The frontmatter and the
compendium badge are pointers; this section is the source. ADR-090 and ADR-089 enumerate
theirs for the same reason.

1. **The concurrency confirmation clause.** ADR-064's Confirmation list asserts:
   "Concurrency tests prove the required quota transition and idempotent replay
   behaviour."

   Written when charge-at-reserve made the required transition a serialised one — the
   whole point of raising `ABORT` inside the insert trigger was that two simultaneous
   reserves could not both be admitted at a hard limit. This record deliberately inverts
   that half: Confirmation criterion 3 above proves both simultaneous reserves ARE
   admitted and that neither has charged. A test written to ADR-064's clause and a test
   written to this record's cannot both pass, so the clause is replaced rather than
   reinterpreted.

   **The replay half stands unchanged** — the primary key still rejects a duplicate
   identity, and criterion 5 above re-proves it. What is superseded is the quota half.

2. **The stop-clause in the Decision Outcome**, which is the one that actually bites and
   which an earlier draft of this record missed. ADR-064's Decision Outcome says: "If
   production-like concurrency testing cannot prove required hard-stop and idempotency
   semantics, implementation stops for a superseding storage decision; a second store is
   not added implicitly."

   Concurrency testing now proves the hard stop is NOT held, so that antecedent is
   satisfied in letter and implementation did not stop. The distinction that discharges
   it, which was recorded nowhere until now: **the clause is aimed at the STORE being
   incapable, and D1 is not.** Migration 0002's `RAISE(ABORT)` trigger proved exactly
   that hard stop and the concurrency test passed against it. The hard stop was GIVEN UP
   deliberately, for an unrelated reason — the permanently-leaked quota this record
   removes — not because the store failed to deliver it. A superseding storage decision
   would answer a question nobody is asking, and no second store is added.

   This record's Related section previously pointed at ADR-064's Reassessment Criteria
   instead ("its reopening trigger has not fired"). That is a different sentence in a
   different section, and it left a reader following ADR-064's own words at
   "implementation stops" with no answer.

ADR-064 is ratified, so both are clause supersessions rather than edits, and ADR-064
itself is unchanged.

## Reassessment Criteria

Reassess if the overshoot proves material against the RapidAPI parity gate, if an
origin-fetch timeout is introduced and makes an exactly-hard limit cheap, or if a
reader appears for a per-period count that the counter cannot serve.

## Related

- Problem 147 — the defect. Dissolved by this decision rather than fixed.
- ADR-064 — commercial state in D1. Its storage choice stands and the maintainer
  confirmed on 2026-09-06 that D1 being Cloudflare-managed answers his concern, so its
  reopening trigger has not fired. Two clauses are superseded above — the concurrency
  confirmation criterion, and the Decision Outcome's stop-clause.
- ADR-080 — the D1 query envelope. Statements per request are unchanged at three.
- JTBD-403 — knowing the paid channel still bills correctly.
