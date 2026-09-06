# Problem 146: Usage records retain the address a customer looked up, in a column no document mentions

**Status**: Verification Pending
**Reported**: 2026-09-06
**Priority**: 9 (Medium) — Impact: Moderate (3) × Likelihood: Possible (3). Impact 3: it would have retained, on activation, per organisation and per API key, which specific addresses a customer resolved. No live subscriber exists, so nothing is disclosed today; the harm is that activation would begin accumulating it silently. Likelihood 3: it was not a possible defect but a certain behaviour of the code AS WRITTEN WHEN REPORTED — the 3 reflects that whether it is judged a defect turns on a purpose nobody has recorded for the column.
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

So for every single-address lookup, the row WOULD HAVE retained which address that organisation
resolved, tied to `organization_id` and `api_key_id`, indefinitely. Written in the conditional
throughout: no subscriber ever existed. Corrected in the fix below.

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
queries" from retention by keeping LOGS off. D1 would have retained the same paths regardless, on
every request, by design of the reserve statement — corrected in the fix below, and prospective
throughout: the channel never carried a subscriber. Keeping observability disabled therefore does not achieve the
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

## Fix Committed 2026-09-06 — option 1, derived not ratified

Option 1 is implemented. `requestRoute()` returns a value from a closed set — `root`,
`addresses`, `addresses/:id`, `other` — so no caller input can reach the column by
construction. Recorded as ADR-090, `human-oversight: unconfirmed`: four options were
live and the maintainer has confirmed none, so the outcome is DERIVED. The code was
changed anyway because the defect is live and the fix is reversible while the tables
are empty; the ratification drain is where the choice is confirmed, amended or
rejected.

An earlier draft of the fix kept the first path segment verbatim. The architecture
review caught that the first segment is caller-controlled — nothing between
authorisation and reservation validates the path — so `GET /{identifier}` would have
retained it while passing a test exercising only routed paths. The behavioural test
now covers an unrouted caller-chosen path and a deep path for that reason, and both
failure modes are mutation-proved.

Exit criteria 1 to 3 are met with the caveat that 1's decision is unratified. Criterion
4 (settled before activation) holds: the channel is still off.

## Options, as they stood before the fix

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
3. BOTH of ADR-088's falsified sentences superseded — the observability ground, and the
   Consequences bullet claiming the customer-data exposure is thereby avoided — since "path
   without the query string" does not
   establish what it is offered as establishing.
4. Settled before activation. After activation the fix stops being free.

## Related

- ADR-088 — the two sentences this contradicts: the observability ground and the
  consequence claimed from it.
- The quota-leak ticket — the other finding from this same review.
- The blocked-route and zone-state tickets — same channel, but they came from the failed
  production apply, not from this review.
