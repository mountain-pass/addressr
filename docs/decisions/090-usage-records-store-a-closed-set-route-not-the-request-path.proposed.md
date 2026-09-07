---
status: 'proposed'
date: 2026-09-06
human-oversight: unconfirmed
decision-makers: [Tom Howard]
consulted: [wr-architect:agent, wr-jtbd:agent]
informed: []
supersedes-clause: 088#worker-observability-stays-disabled, 088#consequences-log-retention-avoided
reassessment-date: 2026-12-06
---

# Usage records store a closed-set route, not the request path

> The outcome below was derived by the capturing agent from an adversarial launch
> review on 2026-09-06 and is NOT yet ratified, which is what
> `human-oversight: unconfirmed` states. Four options were live and the maintainer
> has picked none of them; the `/wr-architect:review-decisions` drain is where one
> is confirmed, amended or rejected. The code has been changed to match the derived
> outcome because the defect it fixes is live and the fix is reversible while the
> commercial tables are empty — not because the choice is settled.

## Context and Problem Statement

`reserveUsage` wrote `new URL(request.url).pathname` into `usage_records.request_path`
on every authorised managed-customer request. The API declares
`GET /addresses/{addressId}`, so on that endpoint the path IS a G-NAF identifier.
On activation the commercial database would therefore have begun accumulating
which specific addresses each organisation resolved, keyed to their API key, with
no redaction and no expiry. Nothing was disclosed: the channel is off and the
2026-09-03 readback records zero rows in all seven commercial tables. Prospective,
and fixed at the last moment it is free.

Nothing under `docs/` said what the column was for. `request_path` occurred at
exactly four sites: the reserve statement, the migration, one test and the ticket.
So there was no recorded intent against which to judge whether the identifier
needed to be there.

Worse, nothing between authorisation and reservation validates the path. A caller
holding a valid key can put anything in ANY segment, including the first, so any
rule that preserves a segment verbatim preserves caller input.

## Decision Drivers

- No reader needs it, checked against the JOBS CORPUS and not only the code. No
  statement in the Worker or the health script selects, filters, groups or orders
  by this column: it is WRITTEN in exactly one statement, the reserve insert, and
  READ in none. Stated as a grep result rather than a statement count, because a
  count is a second thing to get wrong and the property does not need one.
  JTBD-403's money
  outcomes are recorded-versus-delivered and local-versus-provider totals, per
  organisation and meter state — never per endpoint — and no job in the corpus
  mentions per-endpoint accounting or pricing at all.
- The property must hold by construction, not by an argument about what
  well-behaved clients send. A spec does not decide what a client sends.
- It is free to fix now and not free later: the tables are empty and the channel
  is off.
- It sits in the request path, so cost is a Worker CPU line item against budgets
  that are themselves unmeasured.

## Considered Options

1. **Closed-set route** — map the request to a fixed set of known route names, with
   anything unmatched accounting as `other`. **Chosen.**
2. **Route shape by segment** — keep the first path segment and placeholder the
   rest. Rejected: the first segment is caller-controlled, so it retains caller
   input on any unrouted path and would have passed a test exercising only routed
   ones.
3. **Drop the column** — bill on organisation, key, timestamp and outcome, which is
   all any reader uses. Rejected as more than the defect requires, and it needs a
   table-rebuild migration that is free now and not free later. Genuinely viable.
4. **Keep the full path, add a retention period and an expiry sweep** — the only
   option preserving forensic detail. Rejected as the only option needing a
   mechanism nobody has built, for a use nobody has articulated.

## THE GROUND FOR REJECTING OPTION 4 WAS FALSIFIED ON 2026-09-07

Recorded at the top because it changes what this record decides, and a reader who
reaches the Decision Outcome first will otherwise take a rejected option as settled.

Asked to ratify this record, the maintainer answered that **customers will want to see
and search their own request logs.** That is exactly the articulated use whose absence
was option 4's sole rejection ground, and the Reassessment Criteria below anticipated
it in terms. Option 4 is no longer rejectable on that ground.

**What that does NOT do is make the shipped change wrong.** What shipped stops a
commercial table silently accumulating end-user address queries with no policy, no
expiry and no reader. A logs feature is the opposite of that: deliberate retention, with
a stated period, scoped access and a deletion route. The first is a defect; the second is
a product. Keeping the defect would not have delivered the product.

**The consequence that decides sequencing, and it is not reversible.** Usage rows written
before a logs feature exists carry a route label, not an address. That history cannot be
reconstructed afterwards. So if customers are to see request logs covering their earliest
use, the storage decision has to be made BEFORE the channel takes subscribers, not after.
That is a genuine reason to settle this before activation rather than defer it.

**THIS RECORD SHOULD NOT BE RATIFIED AS IT STANDS.** Its Decision Outcome rests on a
premise its own maintainer has now contradicted. Superseding it needs the logs
requirement designed first: what is retained, for how long, who can read it, and how a
customer deletes or exports it. Tracked in the launch-readiness ledger rather than left
here, because a decision record is not a backlog.

## Decision Outcome

Chosen: **option 1**. `requestRoute()` returns a value from `{root, addresses,
addresses/:id, other}`. No caller input can reach the column, by construction rather
than by assertion. Per-endpoint accounting survives at collection granularity, which
is the granularity every articulated use needs.

Implemented with two `indexOf` calls rather than a split. That is NOT O(1) — the
scans are linear — but the work is a bounded scan with a small constant instead of
a per-segment array, so a caller near the URL ceiling cannot buy an allocation
proportional to what they sent. Reasoned from the code, not measured.
Total by construction — it cannot throw, which matters because `reserveUsage`
catches into a `usage_store_unavailable` 503 that would misreport a parse failure as
a storage fault.

## Consequences

- Good: retains strictly less about paying customers, with no articulated loss.
  Bytes written per row fall, and the previously unbounded write is bounded.
- Bad: a new endpoint accounts as `other` until an entry is added. Fail-safe for
  privacy, blind for accounting, and it will be noticed only by someone reading the
  column — which nothing currently does.
- Neutral: no migration. The column definition is unchanged, and the tables are
  empty, so there is nothing to backfill.

## Confirmation

1. A behavioural test against real D1 reserves over a lookup path, a search path, an
   unrouted caller-chosen path and a deep path, and asserts no stored value contains
   the identifier or the search term. Mutation-proved twice: reverting to the raw
   pathname fails it, and so does the rejected option 2.
2. The stored values are asserted to come from a bounded set by cardinality over a
   caller supplying four different paths, so the property is checked rather than the
   representation.
3. A lookup and a search remain distinguishable, so the accounting use is not
   silently lost.
4. Nothing reads `request_path`; re-check before relying on that.

## Retention period, deliberately left open — and the corpus gap under it

Every option except 4 narrows WHAT is retained and none bounds HOW LONG. Rows still
accumulate organisation, key and timestamp indefinitely. That is a separate question
and this decision does not answer it.

There is a load-bearing dependency worth naming, because option 4 was rejected on it.
NO DOCUMENTED JOB carries a customer's expectation about what the service records
about them. JTBD-005 owns the migration that defines this column but governs only who
OWNS a usage row, never what is IN one; `privacy` appears in no job file at all — only in
the corpus README and twice in the self-hosted-operator persona, both times as a
reason for NOT using the managed channel. So the
corpus is silent here rather than supportive, and "a use nobody has articulated" is
sound only while that silence holds. If the ratification drain adds such a job, option
4 stops being rejectable on that ground and this record should be revisited.

## Clauses superseded from ADR-088 — two, enumerated exactly

Enumerated rather than counted, because the `supersedes-clause` anchor in this record's
frontmatter is free text that no check resolves to a location. The frontmatter scalar and
the compendium badges are pointers; this section is the source. ADR-089 and ADR-050
enumerate theirs for the same reason.

1. **The observability ground.** ADR-088 keeps Worker observability disabled and
   grounds it on: "the Worker's one request log deliberately records the path without the
   query string, and enabling provider-side log retention would silently reverse that choice
   and put end-user address queries into retention."

The fact is true; the inference is not. On `/addresses/{addressId}` the path carries the
identifier, so "without the query string" does not establish what it is offered as
establishing — and D1 would have retained those paths regardless of any log setting, so
the control could not have achieved the property on its own.

2. **The consequence claimed from it.** ADR-088's Consequences list asserts,
   unqualified: "Worker log retention, and the customer-data exposure it would create, is
   avoided."

Keeping logs off did not avoid that exposure. The reserve statement wrote the same paths
to D1 on every authorised request whatever the log setting was, so the bullet credits the
wrong mechanism. The exposure is avoided now, by what this record changes the column to
store — not by the observability setting.

**The observability control stands in both cases; what is replaced is the ground given
for it and the consequence claimed from it.** ADR-088 is ratified, so both clauses are
superseded here rather than edited in place, and ADR-088 itself is unchanged.

## Reassessment Criteria

Reassess if a reader for `request_path` appears, if per-endpoint pricing is
introduced, if an abuse investigation needs detail this discards, or if a retention
period is decided and makes option 4 cheap.

## Related

- Problem 146 — the ticket this record answers. It sits in verification rather
  than closed, because its first exit criterion asks for a recorded decision and
  this record is unratified.
- ADR-088 — the two clauses superseded above.
- ADR-080 — the D1 envelope. Unaffected: statements, response bytes and query plans
  are unchanged, and bytes written strictly improve.
- JTBD-403 (Know the paid channel still bills correctly) — the maintainer job that
  owns `customer-channel.mjs`. This record now grounds the observability constraint
  its screens list previously attributed to ADR-088 alone.
- JTBD-005 (Create and access a managed hosted API account) — the customer job that
  owns the migration defining this column. Its outcomes govern who owns a usage row,
  not what is in one, which is the gap named above.
