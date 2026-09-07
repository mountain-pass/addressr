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
