# Problem 147: A failed settle leaks a customer's quota permanently, and nothing sweeps it

**Status**: Open
**Reported**: 2026-09-06
**Priority**: 12 (High) — Impact: Significant (4) × Likelihood: Possible (3). Impact 4: it silently and permanently reduces what a paying customer can use below what they paid for, and the only visible symptom is a `quota_exhausted` 429 they did not earn. It is a billing-correctness defect on the revenue path. Likelihood 3: it needs a settle to fail, which needs a transient D1 error or an isolate the platform stops between two awaits — uncommon per request, close to certain across a quota period at volume.
**Origin**: internal
**Effort**: M — a sweeper is small, but it needs a staleness bound nobody has chosen, and choosing one wrong double-bills or double-releases.
**WSJF**: 6.0 — (12 × 1 for Open) / 2 for Effort M
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

## Exit criteria

1. A chosen staleness bound for an unsettled reservation, recorded with its reasoning. Too short
   double-releases a slow request that is still in flight; too long leaves the customer short.
2. A sweeper that releases reservations older than that bound, and a behavioural test proving a
   stale reserved row is released and a fresh one is not.
3. A test proving the quota returns to its pre-request value when `settleUsage` fails, which is the
   property the customer actually cares about and which nothing asserts today.
4. Settled before activation, or accepted in writing as a known loss with its rate estimated.

## Related

- The retention ticket from the same review — same file, different defect.
- ADR-080 governs the D1 envelope; a sweeper adds a scheduled statement and should be costed there.
