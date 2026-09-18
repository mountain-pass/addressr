# Problem 150: Customers cannot see or search their own request logs

**Status**: Open
**Reported**: 2026-09-07
**Priority**: 12 (High) — Impact: Significant (4) × Likelihood: Possible (3). Impact 4: the ADDRESS IDENTIFIER a logs feature would show is NOT RECONSTRUCTABLE — narrower than an earlier draft claimed, and narrower is what makes it checkable. Timestamp, key, route class, origin status and outcome all survive. Usage rows written before the feature exists carry a fixed route label, not the address, so every request served between activation and the feature shipping is permanently invisible to the customer it belonged to. That is the rare shape where deferring costs something delay alone cannot recover. Likelihood 3 rather than 5 because it only bites once the channel takes subscribers, which is a decision the maintainer has not made.
**Origin**: maintainer, when asked to ratify the retention decision on 2026-09-07
**Effort**: M — not the storage change, which is small, but the design around it: retention period, scoped access, deletion and export. Each is a decision, and two of them are legal-adjacent.
**WSJF**: 6.0 — (12 × 1 for Open) / 2 for Effort M
**JTBD**: none — see below
**Persona**: web-app-developer

## Description

Asked to ratify ADR-090, which decides that a usage record stores a fixed route label
rather than the request path, the maintainer answered: **customers will want to see and
search their own request logs.**

ADR-090 rejected keeping the address on one ground only, quoted from its own text: it was
"the only option needing a mechanism nobody has built, for a use nobody has articulated."
That ground no longer holds. ADR-090's Reassessment Criteria anticipated exactly this
event and said the record should be revisited if it occurred.

## What this is NOT

It is not a reversal of what shipped. The shipped change stopped a commercial table
silently accumulating which specific properties each customer looked up, keyed to their
API key, with no expiry, no policy and no reader. A logs feature is the deliberate
version of that: a stated retention period, access scoped to the owning organisation, and
a route to deletion and export. Reinstating the defect would not have delivered the
feature.

## The sequencing consequence, which is the urgent part

A route label cannot be turned back into an address. Rows written before this feature
exists are permanently unrecoverable for the customer they belong to. So the storage
question has to be settled BEFORE the channel takes subscribers, or the earliest usage is
lost to the very customers most likely to ask for it.

This is the reason the ticket is priority High while the channel is off.

## Investigation Tasks

- [ ] Write the customer job. There is currently NO documented job covering what a
      customer can see about their own usage — ADR-090 records that gap, and this request
      is the second thing in two days to land in it. Without it there is nothing to judge
      the design against.
- [ ] Decide what is retained: the full path, a normalised address identifier, or the
      resolved address. These differ in what a customer can search by.
- [ ] Decide the retention period, and whether the customer can shorten it.
- [ ] Decide access: the owning organisation only, and whether an API key is scoped to
      the requests it made or to all of the organisation's.
- [ ] Decide deletion and export, which are the two obligations a stored-search-history
      feature attracts and which nothing in this repository currently addresses.
- [ ] The superseding record must RE-CARRY ADR-090's two clause supersessions of ADR-088 — the observability ground and the consequence claiming log retention avoided the exposure. ADR-090 is the only record correcting either, and parking it unratifiable strands both.
- [ ] Preserve ADR-090's by-construction property: any retained address identifier must come from a VALIDATED ROUTE MATCH, never a caller-supplied path segment. Nothing between authorising a key and recording usage validates the path, which is what killed the keep-the-first-segment option.
- [ ] Supersede ADR-090 with the outcome. Do not amend it: it stays unratified precisely
      because its premise has been contradicted.

## The storage options, written up 2026-09-18 at the maintainer's request

The irreversible decision is the FIRST investigation task only: what a usage row retains.
Retention period, access scope, deletion and export are all changeable after the fact. What
is not retained is gone, so this section covers that question and defers the rest.

**Who the data is about, which changes the shape of the whole question.** An Addressr
customer is a developer building an application. The addresses flowing through their API
key are typed by THEIR end users, who have no relationship with Addressr and cannot be
asked. So "let the customer see their own request logs" is not only a question about the
customer's data. Options B and C put a third party's address searches into a commercial
store, and the customer's own privacy policy, not ours, is what would have to cover it.
This is the distinction that makes the options differ in kind rather than in degree, and it
is not stated anywhere else in this ticket or in ADR-090.

**The two endpoints retain differently, and conflating them is the trap.** A single-address
lookup carries the identifier in the PATH. A search carries the terms in the QUERY STRING.
ADR-090 stores neither. They are separable, and the useful middle option exists only because
they are.

### Option A. Retain nothing more than today

Route label, timestamp, API key, origin status, outcome. The customer sees how many requests
they made, when, through which key, and whether each succeeded.

- Costs nothing and decides nothing. No new retention, no new obligation, and ADR-088's
  constraint is untouched.
- The feature the maintainer actually asked for does not exist: a customer cannot see WHICH
  address a request was for, so they cannot reconcile a bill line against a user action,
  and cannot debug "why did this lookup fail".
- Honest framing: this is choosing not to build the feature, not a cheap version of it. If
  it is the answer, the gate closes by recording that and the decay stops being a cost.

### Option B. Retain the validated address identifier, never the search terms

For a single-address lookup, store the identifier the route matched. For a search, store
nothing beyond today.

- The customer can see which specific properties were looked up and when. That covers
  bill reconciliation and most debugging.
- The end user's SEARCH — what they typed, which is the free-text, the revealing part — is
  never retained. An identifier is the result of a lookup the customer already received;
  the query is the person's own words.
- Preserves ADR-090's by-construction property, and the ticket already requires it: the
  identifier must come from a VALIDATED ROUTE MATCH, never a caller-supplied path segment.
  Nothing between authorising a key and recording usage validates the path, which is what
  killed the keep-the-first-segment option. Anything less and a caller with a valid key
  writes arbitrary text into the commercial ledger.
- Cost: one nullable column and a route-match check. The retention obligation is real but
  bounded to identifiers of public property records.

### Option C. Retain the identifier and the search terms

Everything in B, plus the query string on searches.

- The only option that delivers "SEARCH their own request logs" in the literal sense the
  maintainer used. A customer could find the session where a user failed to find their
  address, which is the highest-value support case.
- It is also the option that puts a third party's typed address searches into a commercial
  store keyed to an API key, which is materially what ADR-088 criterion 6 refuses to let
  the provider's own logs do. Choosing C is not inconsistent with that criterion, because
  the objection there was retention with no expiry, no policy and no reader. But C only
  stays consistent if the retention period, the deletion route and the export route are
  decided WITH it rather than after, and if the customer agreement states it.
- Cost: the largest, and the two legal-adjacent obligations in the task list attach to this
  option specifically rather than to the feature generally.

### Option D. Retain a one-way digest of the identifier

Store a hash rather than the value. A customer could confirm whether a given address was
looked up by re-hashing it, but could not enumerate what was looked up.

- Recorded because it looks like a privacy-preserving compromise and is the kind of thing
  a later reader proposes. It is not one for this use: the customer cannot BROWSE their
  logs, which is the whole request, and an address identifier space small enough to be
  useful is small enough to be enumerated offline, so the privacy gain is weaker than it
  looks.
- Rejected here, argued rather than omitted.

### What each option costs by waiting

Only B and C decay. Under A nothing is lost because nothing was going to be kept. Under B or
C, every request served between activation and the feature shipping is permanently
unreadable for the customer it belonged to, because a route label cannot be turned back into
an address. That is the whole reason this gate is ordered before activation.

**A cheap way to stop the decay without settling the question:** start writing the Option B
column at activation and build the customer-facing surface later. It separates the
irreversible half from the designed half. It is NOT free of the obligation, because data
retained is data retained whether or not anyone can read it yet, so it is only honest if the
retention period and deletion route are decided at the same time. Recorded as a sequencing
option, not recommended over simply deciding.

## ANSWERED 2026-09-18: option B, the address looked up and not what was typed

The maintainer chose option B when the four were put with their costs. A usage record will
retain the VALIDATED address identifier on a single-address lookup, and nothing beyond
today's route label on a search. The end user's typed query is never retained.

**What this settles, and only this.** The irreversible question, what a row keeps. It does
NOT settle the retention period, the access scope, the deletion route or the export route,
which are the remaining investigation tasks and which are changeable after the fact. It does
not settle who may read the logs within an organisation.

**What it makes newly load-bearing.** The identifier must come from a VALIDATED ROUTE MATCH,
never a caller-supplied path segment. That was already an investigation task; choosing B
promotes it from a design note to the property the whole option rests on. Nothing between
authorising a key and recording usage validates the path today, which is exactly what killed
the keep-the-first-segment option in ADR-090, so a caller holding a valid key can currently
put arbitrary text in the first segment. Option B is only safe with that check in place, and
the check is therefore part of the option rather than a follow-up to it.

**The decay stops when the column ships, not when the feature does.** Under B, every request
served between activation and the column existing is permanently unreadable for the customer
it belonged to. The customer-facing surface can follow later. The write cannot, which is the
whole reason this gate is ordered before activation.

**Still owed before this closes**, unchanged by the answer: the customer job, which does not
exist and which two decisions and this ticket have now all landed in; the record superseding
ADR-090, which must re-carry ADR-090's two clause supersessions of ADR-088 or both are
stranded; and the ledger gate. Retention and deletion remain undecided and one of them is
legal-adjacent, so the column shipping does not license the surface shipping.

## Exit criteria

1. A documented customer job covering visibility of one's own usage.
2. A ratified decision superseding ADR-090, stating what is retained, for how long, who
   reads it, and how it is deleted.
3. The launch-readiness ledger carries a gate for it, classed on evidence.

## Related

- ADR-090 — the record whose rejection ground this falsifies, annotated 2026-09-07 and
  deliberately left unratified.
- ADR-064 — commercial request state in D1, which owns the table this would extend.
- JTBD-005 (Create and access a managed hosted API account) — the nearest existing job.
  It stops at obtaining a key and making calls; it says nothing about seeing what those
  calls were.
