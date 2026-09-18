---
status: proposed
job-id: see-what-my-key-was-used-for
persona: web-app-developer
date-created: 2026-09-19
human-oversight: unconfirmed
screens:
  - "docs/problems/open/150-customers-cannot-see-or-search-their-own-request-logs.md — the ticket that forced this job, and the record of what the maintainer chose on 2026-09-18 about what a usage row retains. Read it before this job's outcomes: the choice is what makes them reachable, and the options NOT chosen are argued there rather than here."
  - 'docs/decisions/090-usage-records-store-a-closed-set-route-not-the-request-path.proposed.md — what a usage record may retain about the request it bills. DELIBERATELY UNRATIFIED: its sole ground for rejecting the keep-the-address option was that there was no use for it and no mechanism, and this job is that use, so its premise is falsified. It must be superseded rather than amended, and the superseding record must re-carry its two clause supersessions of ADR-088 or both are stranded.'
  - 'docs/decisions/095-an-unmeterable-row-is-excluded-wherever-billable-implies-owed.proposed.md — names the statement class this job creates: one that REPORTS billable rows to a person as what they were charged. It records that no such statement exists yet and that the first will be built for this job. A request served past a hard cap is recorded and counted but deliberately never billed, so a surface that shows rows as charges must account for that or it tells the customer something untrue.'
  - 'apps/addressr-deployment/cloudflare-worker/migrations/** — the usage row this job reads. Shares ownership with the account job, which governs WHO OWNS a usage row while this job governs WHAT A CUSTOMER MAY SEE IN ONE. Every file here carries the forward-compatibility obligation recorded against that job.'
  - 'apps/addressr-deployment/cloudflare-worker/customer-channel.mjs — where a usage row is written, and therefore the only place the retained value can come from. SHARED with the billing-correctness job, which owns whether this file bills correctly; this job owns only what it may RETAIN about the request it bills. Declared because a file owned by two jobs with no stated split is how a file comes to be owned by neither.'
---

# JTBD-006: See what my API key was used for

## Job Statement

When a bill arrives, a call fails, or one of my own users tells me an address could not
be found, I want to look at what my key actually did and when, so I can reconcile the
charge, reproduce the failure, and answer my user without guessing.

## THIS JOB IS DERIVED, NOT GATHERED

Recorded plainly because the oversight marker says `unconfirmed` and a reader should know
what that covers. No customer has asked for this. The job exists because the maintainer,
asked on 2026-09-07 to ratify the record that decided a usage row stores a route label
rather than the address, answered that customers will want to see and search their own
request logs. That is a maintainer's belief about a customer, which is a legitimate thing
to write down and a different thing from evidence.

The one part that is NOT derived is the retention choice: the maintainer was put four
options with their costs on 2026-09-18 and chose that a row keeps the ADDRESS LOOKED UP
and never the SEARCH TERMS. The outcomes below are written to that choice.

What would confirm or falsify this job: a subscriber asking for it, or the first support
conversation after activation going somewhere this data would have answered. Neither can
happen before activation, which is why this job is being written ahead of evidence rather
than after it, and why that is recorded rather than hidden.

## Desired Outcomes

- A customer can see, for their own organisation only, the requests made with their keys:
  when, through which key, which route, and whether the origin answered.
- For a single-address lookup, the customer can see WHICH address was looked up, so a
  charge can be reconciled against something they recognise.
- For a search, the customer sees that a search happened and not what was typed. **Stated
  precisely, because the obvious framing is wrong: this is not preserved restraint.** The
  reserve statement binds the path only, so search terms have NEVER been stored under
  either scheme. Option B DECLINES a new collection on the search endpoint while BEGINNING
  a different new collection on the lookup endpoint, so it retains strictly more than
  today, not less.
- The two endpoints differ on three grounds, and the ownership one does not work. An
  earlier draft here said the terms belong to the end user and the identifier does not.
  That does not cut: the same person's intent is in both requests, and a resolved
  identifier is arguably MORE revealing than a partial typed prefix. What holds instead:
  a query string is arbitrary free text a caller controls, while a route-matched
  identifier comes from a validated closed domain, which is the by-construction argument
  ADR-090 already rests on; a search stream is a behavioural trace carrying every typo and
  every abandoned attempt, where a lookup is one deliberate transaction the customer was
  billed for; and for reconciling a charge, "a search happened at this time through this
  key" is already complete, so the terms are not minimal data for the stated job.
- A request served past a hard cap is recorded, counted, and NEVER DELIVERED TO THE USAGE
  METER. Wherever this surface presents requests as what the customer was charged, it
  states the metered figure and the deliberately-excluded figure AS TWO EXPLICIT NUMBERS
  and makes the customer derive neither, which is the rule ADR-094 applied to the account
  panel for the same reason: a surface that makes the reader do the arithmetic states the
  true total nowhere. **Note the predicate, because the customer-true phrase is the wrong
  query:** an excluded row IS `billable` in the schema and is counted; what distinguishes
  it is the unmeterable marker. This surface is the FIRST member of the statement class
  ADR-095 names, so every statement it adds reading `outcome = 'billable'` must account
  for the exclusion or carry a recorded reason, which ADR-095's enumeration guard enforces.
- Requests are identified by the customer-visible key NAME, never by a key prefix or any
  value derived from the secret.
- The customer can tell how long this data is kept, without asking.
- The customer can obtain their own data, and can have the retained address identifier
  removed, without a support conversation. **THE UNIT OF REMOVAL IS OPEN AND THIS JOB DOES
  NOT SETTLE IT.** An earlier draft said "have it deleted", which committed to a shape
  nobody had checked: deleting a usage ROW would retroactively change the local side of the
  reconciliation comparison, under-counting an open window or turning a matched one into a
  mismatch, and usage rows are billing evidence. Field-level redaction of the identifier
  leaves the row, its outcome and its meter state intact and is compatible with the
  role, entitlement and reconciliation decisions; row deletion is not. Who may ask for it
  is also open: commercial mutations are administrator-only, and whether removal is a
  commercial mutation has not been decided.
- Nothing here crosses an organisation boundary, including through a shared key prefix, a
  guessable identifier or an aggregate that reveals another organisation's volume.

## Persona Constraints

- The Web/App Developer is building an application whose USERS type the addresses. What
  the managed channel RETAINS about those users becomes something the developer must
  account for in their own privacy policy, so a surface retaining more than they expected
  is a liability handed to them silently. **Scoped to the usage record deliberately:** the
  gateway forwards the path AND the query string to the origin, so the service PROCESSES
  search terms. What is established here is only that the usage table does not retain
  them. What the origin retains is not established anywhere and is not claimed here.
- They reach this job under time pressure — a bill they did not expect, or a user waiting
  on an answer. It must be readable without first learning a data model.
- They have no support channel and this persona's other jobs assume none.

## What this job does NOT cover, named so the gaps are not read as answers

- **How long data is kept, and how deletion works.** Named as outcomes above because a
  customer needs them, NOT settled here. Both are decisions the maintainer owns and one
  is legal-adjacent. This job states the need and defers the answer.
- **What happens when the allowance runs out.** Still uncovered by any job, as the account
  job already records. A hard limit is a shipped, customer-visible property that no
  documented job carries.
- **What a cap DOES.** This job covers how an over-cap request is DISPLAYED, not what
  happens when an allowance runs out, which no documented job still covers.
- **Anything on the RapidAPI channel.** This job is the managed channel only.

## An obligation this job creates for the record that supersedes ADR-090

Named here because it is easy to inherit and nothing else names it. ADR-088 keeps Worker
observability disabled, and ADR-090 replaced its original ground with "the exposure is
avoided by what this record changes the column to store". Once option B ships, the column
STORES address identifiers, so that replacement ground stops carrying the constraint too.
A defensible ground still exists, because Worker logs would capture the full URL including
the query string, which is precisely what option B declines to store. But it must be
RESTATED by the superseding record, not inherited. This is the second time that
constraint's ground has been falsified by a change to what the column holds.

## Traceability

- Problem 150 is the originating ticket and carries the options and the decision.
- The account job owns who owns a usage row; this job owns what a customer may see in one.
- The launch-readiness ledger's customer-visible request logs gate is ordered BEFORE
  activation, because a route label cannot be turned back into an address: every request
  served before the retained value exists is permanently unreadable for the customer it
  belonged to. That is what makes this job urgent while the channel is still off.
