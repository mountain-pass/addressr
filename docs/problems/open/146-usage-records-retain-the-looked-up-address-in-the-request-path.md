# Problem 146: Usage records retain the address a customer looked up, in a column no document mentions

**Status**: Open
**Reported**: 2026-09-06
**Priority**: 9 (Medium) — Impact: Moderate (3) × Likelihood: Possible (3). Impact 3: it retains, per organisation and per API key, which specific addresses a customer resolved. No live subscriber exists, so nothing is disclosed today; the harm is that activation would begin accumulating it silently. Likelihood 3: it is not a possible defect but a certain behaviour of the code as written — the 3 reflects that whether it is judged a defect turns on a purpose nobody has recorded for the column.
**Origin**: internal
**Effort**: S — the fix is to store less. Deciding what the column is for is the part that needs a person.
**WSJF**: 9.0 — (9 × 1 for Open) / 1 for Effort S
**JTBD**: JTBD-403
**Persona**: addressr-maintainer

## Description

Found by the adversarial launch review the readiness ledger names as un-run, on 2026-09-06.

`reserveUsage` in `apps/addressr-deployment/cloudflare-worker/customer-channel.mjs` writes
`new URL(request.url).pathname` into `usage_records.request_path` on **every** managed-channel
request. The column is `TEXT NOT NULL` in `migrations/0001-managed-channel.sql` and is never
redacted, truncated or expired.

The API has two shapes, per `lib/api/swagger.yaml`:

- `GET /addresses` — the search term is in the query string, which is NOT stored. Fine.
- `GET /addresses/{addressId}` — **the path IS the address identifier.**

So for every single-address lookup, the row retains which address that organisation resolved, tied
to `organization_id` and `api_key_id`, indefinitely.

## Why this is more than a schema opinion

ADR-088 keeps Worker observability disabled and gives this reason, verbatim:

> the Worker's one request log deliberately records the path without the query string, and enabling
> provider-side log retention would silently reverse that choice and put end-user address queries
> into retention.

Two things follow, and the second is the one that matters.

**The reasoning is wrong about which endpoint.** "Path without the query string" is only privacy-
preserving for the search endpoint. On the lookup endpoint the path carries the identifier, so the
Worker's own log line would carry address lookups too if retention were ever switched on. The
control is sound; the justification recorded for it is not, and a future reader weighing whether to
enable logs would weigh it against a false premise.

**The property is already not held, by a different store.** The decision protects "end-user address
queries" from retention by keeping LOGS off. D1 retains the same paths regardless, on every request,
by design of the reserve statement. Keeping observability disabled therefore does not achieve the
property ADR-088 states it achieves.

## What is NOT claimed

That anything has been disclosed. The ledger's 2026-09-03 readback records zero rows in all seven
commercial tables, and the channel is not activated, so the exposure is entirely prospective. That
is the argument for fixing it now rather than the argument for relaxing about it: this is the last
moment at which the table is empty.

Nor is it claimed the column is useless. Per-endpoint accounting is a legitimate reason to record
something about the path. What is missing is any recorded statement of what it is for, which is what
would let anyone judge whether the identifier needs to be in it. `request_path` appears nowhere
under `docs/`.

## Options, none chosen here

1. Store the matched ROUTE rather than the path — `/addresses/{addressId}` instead of the resolved
   identifier. Keeps per-endpoint accounting, retains no address.
2. Store nothing but the endpoint class, or drop the column.
3. Keep it and record why, plus a retention period and the reason the privacy consequence is
   acceptable. This is a legitimate answer; it is just not one anybody has given.

Any of the three needs the ADR-088 justification corrected as well, because that sentence is wrong
independently of what this column does.

## Exit criteria

1. A recorded decision on what `request_path` is for, with its privacy consequence stated.
2. The code matching that decision, with a behavioural test asserting a lookup path does not persist
   the identifier — unless option 3 is chosen, in which case a test asserting it deliberately does.
3. ADR-088's observability justification corrected, since "path without the query string" does not
   establish what it is offered as establishing.
4. Settled before activation. After activation the fix stops being free.

## Related

- ADR-088 — the observability justification this contradicts.
- The quota-leak ticket — the other finding from this same review.
- The blocked-route and zone-state tickets — same channel, but they came from the failed
  production apply, not from this review.
