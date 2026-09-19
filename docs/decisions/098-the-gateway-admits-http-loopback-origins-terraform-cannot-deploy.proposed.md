---
status: 'proposed'
date: 2026-09-19
human-oversight: confirmed
oversight-date: 2026-09-19
decision-makers: [Tom Howard]
consulted:
  [
    wr-architect:agent,
    wr-jtbd:agent,
    wr-risk-scorer:external-comms,
    wr-voice-tone:external-comms,
  ]
informed: []
supersedes-clause: 095#confirmation-6
reassessment-date: 2026-12-19
---

# The gateway admits http loopback origins that Terraform cannot deploy

## What this record asked of the maintainer

This record covers one change, already shipped: the gateway now admits `http://` origins on
loopback hosts. That lets a page served from your own machine exercise the customer journeys
before the managed channel — the paid, authenticated API that customers would sign up for
directly — is switched on. Terraform validation stops such an origin ever reaching production.

Three things were not shown to the maintainer when they chose. They were put to them on
2026-09-19, read, and the record was confirmed on the strength of that reading. They are:

1. **It retires one clause of a decision the maintainer had already ratified.** This change made the
   evidence under ADR-095's confirmation item 6 false. The conclusion survives on a
   narrower argument, set out under "The one clause this record supersedes" below.
2. **The Terraform guard accepts more than the gateway accepts.** Some values pass the
   plan and then leave the gateway refusing every managed route. It fails closed, but it
   fails, and the failure is at deploy time rather than at plan time.
3. **If the two Terraform guards ever drift apart, one direction of drift is silent.**

Confirming this record switches nothing on. The gateway change has already shipped, and the
managed channel is still off — `managed_channel_enabled` is still false, and that switch
remains yours alone.

## What the maintainer chose, and why this record was withheld from confirmation until 2026-09-19

Four options were put to the maintainer on 2026-09-19, and they chose this one: the gateway admits
local addresses, made impossible in production by Terraform validation. That is a real
direction-setting decision and the Decision Outcome below is theirs.

The record was nonetheless withheld from confirmation, because the oversight marker attests
to what a human **saw**, and this record carried substance they had not been shown: the three
items listed at the top. Marking it confirmed before that reading would have attested to a
reading that did not happen. The reading happened on 2026-09-19 and the marker followed it.

**Corrected in place on 2026-09-19, after ratification and out of the intended order.** The
marker was written before this passage was updated, so for a short window the record asserted
its own unconfirmed state while carrying the confirmed marker. The superseded wording, quoted
verbatim: "The record is nonetheless `unconfirmed`, because the oversight marker attests to
what a human **saw**, and this record carries substance they were not shown: the three items
listed at the top. Marking it confirmed would attest to a reading that did not happen." What
replaced it is the paragraph above, in the past tense. No decision substance changed: the
origin-filter rule, both Terraform validations and all seven confirmation items are untouched,
and `status:` is unchanged, because ratification is the oversight marker and not the status
field. Retained rather than silently rewritten, because this record is ratified and
implemented.

**The list of unshown substance above was one item longer until 2026-09-19, and the removal
is the point.** The fourth item was option 5 below, the do-nothing path that needed no
widening at all. That was put to the maintainer explicitly, after the widening had already
shipped and with the cost of backing it out named. They chose to keep the widening. So the
option is no longer unshown, and the record no longer claims it is. Recorded here rather
than quietly deleted, because "they were not shown the cheaper alternative" is the
strongest objection this decision faces, and it has now been answered rather than avoided.

## Context and Problem Statement

Nine launch gates are open only because the managed channel is off, and the maintainer
accepted that, asking for a local dress rehearsal first so the customer journeys are proven
before activation rather than after. The rehearsal began as a request. The maintainer then
hardened it into a precondition of activation.

Scoping it found the obstacle. A page served from `http://127.0.0.1:9000` could not reach
the gateway at all. The gateway is a Cloudflare Worker, and its origin filter admitted
`^https://[a-z0-9.-]+$`, https only and no port, so no loopback host could ever be admitted.
Every managed call returned 403 before routing, before Clerk, before D1.

Three things sit behind that filter: Clerk, the identity provider that issues the bearer
tokens; D1, the database; and the managed routes themselves.
CORS — Cross-Origin Resource Sharing — is the browser's own permission check for requests
made across origins, and the filter decides what it will permit.

So there was no rehearsal, and the reason was a security control doing its job.

## Decision Drivers

- The journeys must be proven before activation and nothing local could reach the gateway.
- The obvious workaround, having the test inject the CORS header the gateway refused to
  emit, puts fiction back at exactly the seam a rehearsal exists to remove, and would leave
  a real regression in the origin check permanently green.
- Loosening a control on an argument is not the same as loosening it on a mechanism, and
  this repository already keeps the source of truth in Terraform.
- **The reasoning that first looked sufficient was not.** "CORS is browser-enforced, so a
  non-browser client sends any Origin anyway" is true and covers **one** of five consumers.

## Who depends on the origin allowlist

Five consumers, not the one the first draft of this record knew about.

| Consumer                              | What widening does                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------------------- |
| the pre-authentication 403            | admits the origin to every managed route but the Stripe webhook, mutating ones included |
| the configuration-availability report | makes a deployment whose only origin is loopback report itself available                |
| `identity_not_configured`             | turns a refusal into a 503 on a live authenticated request                              |
| Clerk `authorizedParties`             | widens the token-issuer values the gateway will accept                                  |
| the CORS response header              | covers the one case the browser-enforcement argument actually reaches                   |

The mutating-route consumer matters most. A page at an admitted origin could POST a
checkout, create an API key or delete one. What holds that line is that those routes take a
bearer token rather than a cookie, and a loopback page cannot obtain a production Clerk
token, so this is the loss of a defence-in-depth layer and not a direct hole.

## Considered Options

1. **Admit loopback origins, and make Terraform unable to deploy one. Chosen.**
2. **Inject the CORS header in the test.** Rejected: it fabricates the header the gateway
   refused to emit, so a regression in the origin check stays green and the rehearsal
   produces no evidence about origin policy while appearing to.
3. **Gate the admission on the managed-channel flag being off.** **Rejected on function, not
   coupling: with the flag off every managed route but config returns 503 before any session
   work, so the rehearsal could only run against a gateway refusing everything it needs.**
4. **Rewrite the Origin header in a local proxy.** No production change at all. Put to the
   maintainer on 2026-09-19 alongside the chosen option, and not chosen. No technical objection
   was recorded against it, and none is invented here: it lost because the maintainer picked
   another option, which is a sufficient reason and the honest one.
5. **Serve the rehearsal over https on port 443 instead, and change nothing.** Also no
   production change, and different from option 4: no proxy and no header rewriting, just a
   different port and certificate. Recorded because an ADR that widens a security boundary
   without naming the option needing no widening is not weighing the choice. The unchanged
   https rule already admits `https://localhost`, so a page on 443 with a locally-trusted
   certificate reaches the gateway today. The cost is real: port 443, a trusted local
   certificate, and the local worker's default http port does not qualify. Not chosen, but
   it was available.

## Decision Outcome

The gateway admits an http origin when, and only when, its host is exactly `127.0.0.1`,
`localhost` or `[::1]` and a port is present. The https rule is unchanged.

**Chosen once from four options, then kept when the fifth was named.** Option 5 was not among
the four, so the first choice was not made against it. Later on 2026-09-19, after the widening
had shipped, the maintainer was told that option 5 existed, needed no widening at all, and that
choosing it would mean backing out work already done. They kept the widening. Recorded
because a decision that survives its cheaper alternative being named afterwards is a
different and stronger thing than one made before.

**The admission is made unreachable in production by validation at the source, not by
intention.** `MANAGED_APP_ORIGINS` is `jsonencode([var.managed_app_url])`, so that one
variable is the only way a value enters the deployed allowlist. It now carries a `^https://`
validation. A deployment carrying an http origin **fails to plan**.

**Not "no loopback origin can be deployed".** `https://localhost` and `https://127.0.0.1`
satisfy the validation and the unchanged https rule. That admissibility predates this change
and is untouched by it. What is foreclosed is exactly the class this change added. An earlier
draft of this record, and of all three source comments, claimed the stronger thing.

**The duplication at two boundaries is part of the decision.** They differ by **caller**, not by
consequence: the module renders both `MANAGED_APP_ORIGINS` and `MANAGED_APP_URL` from the one
variable, so each site guards the allowlist and the Stripe return links. The root catches the
value as entered; the module catches any caller that renders the bindings. That is why one
test asserts the validation at both sites.

## Two properties of the guard as written, both of them costs

**The root predicate accepts a superset of what the Worker origin filter accepts.** It is
unanchored at the end; the filter is anchored both ends, lowercase-only and port-free. So any
of these plans clean and then fails the filter: a port, a trailing slash, a path, userinfo
(the `user:pass@` prefix a URL may carry), or any uppercase host character. The result is an
empty effective allowlist and a 503 on every managed route — it fails closed, refusing
everything rather than admitting anything.
It is a property of this guard as written and not pre-existing: the block is new, and before it
the root validated nothing.

**Drift between the two sites is visible in one direction only.** If the module drifts stricter,
the root accepts a value it refuses and the plan fails loudly. If the module drifts more
permissive the root refuses first, the module never sees a bad value, and the drift is
invisible. That is the direction that matters, because the module exists for a caller the root
does not stand in front of.

## Why the host literals are anchored and exact

The hosts that defeat a loose alternation contain a loopback literal:
`localhost.attacker.example` is an ordinary remote host that an unanchored match would admit.

Every origin in the list below is asserted refused. Enumerated rather than counted in prose,
and deliberately in one place only, because the count has gone stale twice already as cases
were added. That rule is scoped to this list, which grows under review; the five consumers
counted earlier are fixed by the code and do not need it.

1. `http://evil.example`
2. `https://evil.example:8443`
3. `http://localhost.attacker.example:3000`
4. `http://127.0.0.1.attacker.example:3000`
5. `http://[::1].attacker.example:3000`
6. `http://127.0.0.2:3000`
7. `http://[::2]:3000`
8. `http://localhost`, with no port
9. `http://127.0.0.1`, with no port
10. `http://[::1]`, with no port
11. `http://127.0.0.1:9000/`, with a trailing slash

The contains-attack on `[::1]` and the bare `http://[::1]` were each added during review, and
for the same reason: two of the three host literals had that case and the third did not. Both
gaps were found by enumerating the set rather than reading the list. Named rather than
numbered, so that inserting a case does not make this paragraph wrong.

`localhost` is kept rather than dropped for the numeric literals alone. It is a name, so
resolver control could in principle make a remote page carry that Origin, but that needs
hosts-file access, browsers special-case it toward loopback, and the hazard only bites in a
deployment carrying the entry, which the validation forbids.

Recorded so the next reader need not find it: `\d{1,5}` admits `:00000` and `:99999`, which are
not valid ports. No consequence, because an entry no browser can send never matches.

## Confirmation

1. **SATISFIED 2026-09-19.** The gateway admits the three loopback origins when present in the
   allowlist, and echoes the CORS header. The test was written before the change, and failed
   first.
2. **SATISFIED 2026-09-19.** The gateway refuses every origin in the enumerated list above.
   Stated as the property rather than as a count, because a count restales the moment a case
   is added — which has now happened twice.
3. **SATISFIED 2026-09-19.** A loopback entry admits only its **exact** port.
4. **PARTLY SATISFIED 2026-09-19.** Terraform refuses a non-https `managed_app_url`. The
   predicate was executed: extracted into an isolated module and planned twice, the https
   default accepted and `http://127.0.0.1:9000` refused with the validation's own message.
   What that exercised was a copy, which is why this is partial. The root module cannot be
   planned locally without backend credentials, and no `.tftest.hcl` runs because nothing here
   invokes `terraform test`.
5. **SATISFIED 2026-09-19.** The validation's presence **and subject** are pinned at both
   sites by a test that runs. Proved by mutation: pointing the condition at a different
   variable makes the test fail. The subject is part of the pin because a pattern-only
   assertion survives that swap with the guard gone.
6. **SATISFIED 2026-09-19** by commit `4d84f472`, which made the website's managed API base
   configurable, as this criterion required. A built-output test asserts that the emitted
   account bundle carries the production base and no loopback one.

   Which half of that test does the work was measured, not assumed. Review raised that the
   positive assertion might be vacuous, because `OVERRIDE || 'production'` could leave both
   strings in the bundle. Two builds with overrides settled it: the `||` folds, so the
   production literal is absent whenever an override is set, and the positive assertion
   therefore catches **any** override rather than only a loopback one. Proved on a loopback
   base and on `https://staging.example.com/managed`; the second makes the positive assertion
   fail on its own, which the loopback-only negative list would have missed.

   The negative assertion is a second, narrower check, and its narrowness is recorded beside
   it in `apps/website/test/rendered-output.test.mjs`.

7. **NOT SATISFIED**, and not created here. Nothing asserts that a `screens:` path in a job
   record resolves. The test that pins this record's own validation is named by such a path.

## The one clause this record supersedes

**ADR-095's confirmation item 6, in the part that is now false.** Quoted as written, capitals
and all: "That the current source IS the deployed Worker was MEASURED on 2026-09-18, not
reasoned: the Worker
source tree is byte-identical between HEAD and `c8d7c2f5`, the revision the last applying release
deployed from, so the diff is empty… The remaining unapplied change in the deployment tree is
comment-only in `main.tf` and has no plan effect."

**This change falsified both halves.** It edits the Worker, so the tree is no longer
byte-identical and the release deploys a new bundle alongside migration 0004; and the deployment
tree now also carries the origin widening and two validation blocks.

What is superseded is **the evidence, not the conclusion**. Release 1 remains
forward-compatible on a narrower argument: not "the Worker is unchanged" but "the changed
Worker references neither new column", measured by grep for `unmeterable_reason` and
`unmeterable_count` over the Worker sources, which returns nothing. ADR-093 forbids a Worker
that depends on a pending migration, not any Worker change.

ADR-095 is ratified, so this is a clause supersession rather than an edit. Everything else in it
stands.

## Reassessment Criteria

Reassess this decision if any of these happen:

- The managed app origin needs to hold more than one value. The validation would then be the
  wrong shape.
- A rehearsal is built that needs no browser origin. The admission would then be unnecessary.
- Clerk changes how `authorizedParties` works, so the allowlist stops feeding it.

## Related

- ADR-095 — the clause superseded above.
- ADR-074 — Origin as a policy signal, which this widens and why it needed a record.
- ADR-062 — hosted customer access enforced at the gateway; malformed configuration must fail
  closed, which the Worker origin filter still does, by dropping an unrecognised entry rather
  than failing open.
- ADR-061 — the stable account and billing origin, which is the variable this validates.
- ADR-068 — Stripe-hosted billing interactions, whose return URLs the same variable builds.
- ADR-093 — the deploy ordering invariant, on which release 1's safety now rests.
- JTBD-403 — the documented job to be done of proving the paid channel works before switching
  it on, which this serves.
- JTBD-005 — creating and accessing a managed hosted API account. That is the customer-facing
  job of signing up, subscribing and obtaining an API key, and it owns the allowlist.
