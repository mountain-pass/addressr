# Problem 147: A failed settle leaks a customer's quota permanently, and nothing sweeps it

**Status**: Verification Pending
**Reported**: 2026-09-06
**Priority**: 12 (High) — Impact: Significant (4) × Likelihood: Possible (3). Impact 4: it silently and permanently reduces what a paying customer can use below what they paid for, and the only visible symptom is a `quota_exhausted` 429 they did not earn. It is a billing-correctness defect on the revenue path. Likelihood 3: it needs a settle to fail, which needs a transient D1 error or an isolate the platform stops between two awaits — uncommon per request, close to certain across a quota period at volume.
**Origin**: internal
**Effort**: M — a sweeper is small, but it needs a staleness bound nobody has chosen, and choosing one wrong double-bills or double-releases.
**WSJF**: 6.0 — (12 × 1 for Verification Pending) / 2 for Effort M
**JTBD**: JTBD-403
**Persona**: addressr-maintainer

## Description

Found by the adversarial launch review the readiness ledger names as un-run, on 2026-09-06.

The managed request path in `worker.js` is: reserve, call the origin, settle. In
`apps/addressr-deployment/cloudflare-worker/customer-channel.mjs`:

- `reserveUsage` inserts a row with `outcome='reserved'`. A trigger increments
  `entitlements.quota_used` and aborts with `quota_exhausted` if the limit is reached.
- `settleUsage` either finalises the row to `billable` or DELETEs it. A second trigger decrements
  `quota_used` **only on DELETE of a reserved row**.

So the quota decrement happens exactly once, in exactly one place, and only if `settleUsage`
completes. If it does not, the row stays `reserved` and `quota_used` stays incremented.

**Nothing ever releases it.** A grep for `outcome = 'reserved'` across the Worker directory returns
four hits: two in `customer-channel.mjs`, inside the finalize and release statements themselves, and
two in the migrations, inside the triggers already described. None of them is a sweep. There is no sweeper, no TTL, no startup reconciliation. The
scheduled handler runs `runMeterOperations`, which reconciles METER delivery, not reservations. And
`reconcileEntitlements` deliberately preserves same-period usage — there is a behavioural test
asserting exactly that ("repeated and concurrent reconciliation repairs policy without resetting
same-period usage"), so the one process that touches entitlements is specified NOT to repair this.

## The two ways it happens

1. **A transient D1 error.** `settleUsage` catches, returns false, and the Worker answers
   `usage_store_unavailable`. The reservation is left behind deliberately — but nothing collects it.
2. **The isolate stops between the two awaits.** CPU limit, eviction, an unhandled platform error.
   No catch runs at all. Same residue.

Note the first case is the code's own designed failure path, not an edge: the Worker returns a 503
it explicitly models, and every one of those 503s permanently costs the customer one request of
their quota.

## Why it is worse than it looks

The loss is monotonic and invisible. Each occurrence reduces the customer's usable quota by one for
the rest of the period, with no counter anywhere showing the discrepancy between requests they
actually made and `quota_used`. At the limit they receive `quota_exhausted` while genuinely under
their paid allowance, and the ledger's own reconciliation evidence would show nothing wrong, because
reconciliation is specified not to touch it.

It also interacts with the failure it is most likely to co-occur with: a D1 wobble that fails one
settle is likely to fail several, so the loss arrives in bursts precisely when the customer is
already seeing errors.

## What is NOT claimed

That it has happened. No subscriber exists and the ledger's 2026-09-03 readback records zero rows in
all seven commercial tables, so this is prospective. It is also NOT claimed that the reserve/settle
design is wrong — reserving before the origin call is what makes the quota check atomic under
concurrency, and that is tested. What is missing is the collection of reservations that never
settle.

## The obvious fix is wrong — architecture review, 2026-09-06

A sweeper was drafted and a failing test written for it, then withdrawn. Recording why,
because the trap is not visible from the ticket as first written and the next person to
pick this up will draft the same thing.

**A naive sweep introduces a worse defect than it repairs.** `settleUsage` finalises with
`WHERE id = ? AND outcome = 'reserved'` and returns false when `changes` is 0. So a
request whose reservation was swept while it was still in flight gets `503
usage_store_unavailable` — for a request the origin actually served. That converts a
silent accounting loss into a visible availability failure, the customer retries, a
second origin call and a second reservation follow, and the request goes unbilled as
well. Worse on every axis than the leak.

**The root of that is a conflation, and it is wrong independently of any sweeper.**
`settleUsage` returns `false` for two different facts: D1 threw, and `changes === 0`. On a
statement scoped to `id` and `outcome`, `changes === 0` means the row is not there — which
is not a store outage, so the 503 is a false statement about the system. Making settle
three-valued (settled / store-unavailable / row-absent) removes the false 503 and demotes
the staleness bound from a correctness control to tuning. That is the ordering: fix the
conflation first, and the hard question gets cheap.

**"No migration" was wrong.** `usage_records` has indexes on `(organization_id,
created_at)` and `(meter_state, created_at)`. Neither serves a predicate on `outcome`, so
`DELETE ... WHERE outcome = 'reserved' AND created_at < ?` is a full table scan of a table
nothing prunes, 288 times a day, growing forever with billable volume. A partial index —
`(created_at) WHERE outcome = 'reserved'` — flattens it, and it is free now while the
tables were empty at the 2026-09-03 readback and not free later.

**No budget governs the scheduled path at all.** ADR-080's envelope is textually
request-scoped: "every managed REQUEST outcome", "every REQUEST-TIME lookup". One more
statement every five minutes breaches nothing in it, and that is the problem — the scan
above is ungoverned rather than permitted. Extending ADR-080 or recording the scheduled
path as explicitly ungoverned is owed either way.

**A period straddle hands out a free request.** Reconciliation resets `quota_used` to 0
when `quota_period` changes. The release trigger decrements the CURRENT row, guarded only
by `quota_used > 0`. A row reserved in period P and swept after the roll to P+1 decrements
P+1 — a period where that request was never charged. Small, and it favours the customer,
but it is a silent error on the billing spine: scope the release to a matching period or
accept it in writing.

**The sweep must report what it collected.** It would otherwise be the only evidence that
settles are failing, destroying that signal as it acts. `runMeterOperations` already builds
and logs an outcome object; the collected count belongs in it, reported when non-zero, so
it reaches the session-start reader. ADR-051.

**Two smaller things.** The DELETE has no organisation predicate, so one malformed cutoff
sweeps every customer at once; and `created_at` is TEXT compared with `<`, which is correct
only while every value is a same-length ISO-8601 Z string — true of `reserveUsage` today,
enforced by nothing.

## Two decisions this needs, and they are not the agent's

Recorded as questions rather than answered, because both are customer-visible behaviour on
the paid path and the options differ materially.

**1. What bounds the legitimate in-flight window?** Nothing in the corpus fixes it — the
latency budget is percentiles and cannot bound a tail, the compute envelope is CPU and the
wait on the origin is not CPU. And the origin fetch carries no timeout at all, so today the
window is bounded only by an unpinned provider default. Either set an explicit
`AbortSignal.timeout` on the origin fetch and derive the bound arithmetically from it — a
number every term of which is owned and testable — or pick a conservative bound by
judgement and accept that no test can justify it.

**2. What does a customer receive when their successful request's reservation was swept?**
Today's code says 503. The candidate is: return the origin response and record the billable
usage. That re-insert fires the reserve trigger, which can `RAISE(ABORT, 'quota_exhausted')`
if the customer has since hit their limit — dropping a genuinely billable request. That
wrinkle needs settling with the answer.

## Design alternatives, and the O(1) one — 2026-09-06

The maintainer's reaction to the sweeper was that the whole reserve-and-count dance looks
overcooked, and asked whether the quota could simply be derived by counting requests in the
period. That reframing is right about the cause: the leak exists ONLY because the counter is
incremented at RESERVE, before the outcome is known. Anything that stops counting
reservations dissolves this ticket rather than fixing it.

**Counting rows is not O(1), and that is not a SQLite limitation.** Neither D1 nor Postgres
maintains a row count for you — a materialised view could, at its own write cost, and neither
engine gives you one by default; Postgres is worse under MVCC because visibility must be
checked per row. Deriving the gate by counting billable rows costs work proportional to
requests already made in the period, so across a period it is roughly Q²/2 rows read per
organisation, where Q is the allowance. D1 bills rows read. The counter being removed IS the
O(1) materialisation of exactly that count. Measured against a replica schema: the existing
`(organization_id, created_at)` index serves the count as a range scan, but NOT as a covering
index — `outcome` is not in it — so each candidate row also costs a table lookup.

**The O(1) alternative, and it is a small change.** Keep the counter; increment it at SETTLE
rather than at reserve. A stranded reservation never settles, so it never increments. This
ticket dies identically, the gate stays O(1), there is no migration and no rewrite of the
billing path. Its only cost against counting is that a counter is a second truth that can
drift from the rows.

**Three traps found in the count-based sketch, recorded so they are not rediscovered.**
`COUNT(*) < quota_limit` alone rejects EVERY pay-per-use customer, because migration 0002
permits `hard_limit = 0` with `quota_limit = 0`. The existing concurrency test — two
simultaneous reserves against a limit of one — INVERTS rather than merely needing an update,
and it is the instrument discharging ADR-064's confirmation criterion 4, so redefining what
it asserts is itself the decision. And `quota_period` is Unix epoch seconds while `created_at`
is an ISO-8601 string, so a derived range start needs a conversion and a fail-closed guard: a
start that will not parse yields a count of zero and admits everything, which is fail-OPEN on
the paid path and conflicts with ADR-062.

**A latency gate is measured wrong today either way.** ADR-077's benchmark runs against a
fresh database, so under any counting design it measures the empty case and passes trivially
while the second half of every period is untested. If a counting design is chosen, that
benchmark must be re-specified to run at a full period's worth of rows.

## Dissolved 2026-09-06 by ADR-091, not fixed

The maintainer chose to charge the quota when a request is known billable rather than
before it is attempted. A reservation that never settles now costs nothing, so this
defect cannot occur — there is no residue to collect, and the sweeper, the staleness
bound and the swept-then-settled response question all go with it. THE PERIOD STRADDLE
DOES NOT, and an earlier version of this paragraph wrongly said it did: the settle trigger
increments with no period predicate while reconciliation resets the counter on rollover,
so a row reserved in one period whose settle lands after the rollover charges the next
one. Far smaller than the swept version — one origin fetch rather than a sweeper interval
— but it runs against the customer rather than for them. Accepted in writing in ADR-091's
Consequences rather than fixed.
Recorded as dissolved rather than fixed because nothing here was repaired; the condition
that produced it was removed.

Accepted cost, his call against an exactly-hard limit: simultaneous requests can exceed
a hard limit by roughly the number in flight. Sequential requests are still refused at
the limit, and the concurrency test asserts both halves.

Moves to verification rather than closed because the change is merged, not deployed —
migration 0003 is not yet applied to production, so the charge point there is still the
old one — and the channel is off besides.

## The decision that was needed, answered 2026-09-06

Whether an in-flight reservation should consume quota — which is what decides whether a hard
limit can be overshot by simultaneous requests. ANSWERED: it should not. Charge when the
outcome is known billable, accepting the concurrency overshoot. See ADR-091, which is
ratified rather than derived: the maintainer chose it.

The database question he raised is SETTLED and did not reopen ADR-064. He had read "SQLite"
as an unmanaged instance; on being told D1 is Cloudflare's managed product, provisioned by
the same Terraform as the rest of the channel, he accepted it — 2026-09-06. ADR-064 stands as
ratified and its reopening trigger (concurrency testing failing to prove hard-stop and
idempotency) has not fired. Recorded because the same reading is available to the next person
who meets the word SQLite in this design. What D1 genuinely costs, as against a hosted
Postgres, is rows-read billing, a single writer, and read replication currently disabled.

## Exit criteria, rewritten 2026-09-06

The original criteria asked for a sweeper, a staleness bound and a partial index. None of
them applies: the defect was dissolved rather than fixed, so there is nothing to sweep and
no bound to choose. What remains is observation.

1. Migration 0003 applied to production D1, confirmed by readback, so the charge point in
   production matches the code.
2. A managed request observed end to end after activation charging exactly once, and a
   request whose settle fails observed charging nothing.
3. The accepted concurrency overshoot measured rather than reasoned, and checked against the
   RapidAPI parity gate — ADR-086 makes hard-limit behaviour a parity item, and nobody has
   established what RapidAPI does at the boundary.

Note for whoever picks this up: `settleUsage` still returns the same `false` for a thrown
error and for zero rows changed. The reserve path no longer has that conflation — exhaustion
is now zero rows written and reported as 429 — but settle does. It is harmless today because
nothing deletes rows out from under a settle, and it would matter again if anything ever did.

## Related

- The retention ticket from the same review — same file, different defect.
- ADR-080 governs the D1 envelope; a sweeper adds a scheduled statement and should be costed there.
