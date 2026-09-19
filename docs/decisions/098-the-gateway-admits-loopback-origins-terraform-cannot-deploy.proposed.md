---
status: 'proposed'
date: 2026-09-19
human-oversight: unconfirmed
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

# The gateway admits loopback origins that Terraform cannot deploy

## What the maintainer chose, and why this record is UNCONFIRMED anyway

The maintainer was put four options on 2026-09-19 and chose this one: the gateway admits
local addresses, made impossible in production by Terraform validation. That is a real
direction-setting decision and the Decision Outcome below is theirs.

The record is nonetheless `unconfirmed`, because the oversight marker attests to what a
human SAW, and this record carries substance they were not shown: the clause supersession
of ADR-095's confirmation criterion 6, the superset property of the guard, and the
one-sided visibility of drift between the two sites. Marking it confirmed would attest to
a reading that did not happen.

**ONE ITEM CAME OFF THAT LIST ON 2026-09-19 AND THE REMOVAL IS THE POINT.** The list also
carried option 5 below, the do-nothing path that needed no widening at all. That was put to
the maintainer explicitly, after the widening had already shipped and with the cost of
backing it out named. They chose to KEEP the widening. So the option is no longer unshown,
and the record no longer claims it is. Recorded here rather than quietly deleted, because
"they were not shown the cheaper alternative" is the strongest objection this decision
faces and it has now been answered rather than avoided.

## Context and Problem Statement

Nine launch gates are open only because the managed channel is off, and the maintainer
accepted that on one condition: a LOCAL DRESS REHEARSAL first, so the customer journeys are
proven before activation rather than after. They then made it necessary rather than optional.

Scoping it found the obstacle. A page served from `http://127.0.0.1:9000` could not reach
the gateway at all: the origin filter admitted `^https://[a-z0-9.-]+$`, https only and no
port, so no loopback host could ever be admitted. Every managed call returned 403 before
routing, before Clerk, before D1.

So there was no rehearsal, and the reason was a security control doing its job.

## Decision Drivers

- The journeys must be proven before activation and nothing local could reach the gateway.
- The obvious workaround, having the test inject the CORS header the gateway refused to
  emit, puts fiction back at exactly the seam a rehearsal exists to remove, and would leave
  a real regression in the origin check permanently green.
- Loosening a control on an argument is not the same as loosening it on a mechanism, and
  this repository already keeps the source of truth in Terraform.
- **The reasoning that first looked sufficient was not.** "CORS is browser-enforced, so a
  non-browser client sends any Origin anyway" is true and covers ONE of five consumers.

## The five consumers, because the first draft of this record knew about one

| Consumer                              | What widening does                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------------------- |
| the pre-authentication 403            | admits the origin to EVERY managed route but the Stripe webhook, mutating ones included |
| the configuration-availability report | a deployment whose only origin is loopback reports available                            |
| `identity_not_configured`             | a 503 on a live authenticated request                                                   |
| Clerk `authorizedParties`             | widens the token-issuer values the gateway will accept                                  |
| the CORS response header              | the case the browser-enforcement argument actually covers                               |

The mutating-route consumer matters most. A page at an admitted origin could POST a
checkout, create an API key or delete one. What holds that line is that those routes take a
bearer token rather than a cookie, and a loopback page cannot obtain a production Clerk
token, so this is the loss of a DEFENCE-IN-DEPTH LAYER and not a direct hole.

## Considered Options

1. **Admit loopback origins, and make Terraform unable to deploy one. Chosen.**
2. **Inject the CORS header in the test.** Rejected: it fabricates the header the gateway
   refused to emit, so a regression in the origin check stays green and the rehearsal
   produces no evidence about origin policy while appearing to.
3. **Gate the admission on the managed-channel flag being off.** **Rejected on FUNCTION, not
   coupling: with the flag off every managed route but config returns 503 before any session
   work, so the rehearsal could only run against a gateway refusing everything it needs.**
4. **Change nothing; rewrite the Origin in a local proxy.** Zero production diff. Put to the
   maintainer and not chosen.
5. **DO NOTHING AT ALL, and serve the rehearsal over https on port 443.** Recorded because an
   ADR that widens a security boundary without naming the option needing no widening is not
   weighing the choice. The unchanged https rule already admits `https://localhost`, so a page
   on 443 with a locally-trusted certificate reaches the gateway today. The cost is real: port
   443, a trusted local certificate, and the local worker's default http port does not
   qualify. Not chosen, but it was available.

## Decision Outcome

The gateway admits an http origin when, and only when, its host is exactly `127.0.0.1`,
`localhost` or `[::1]` AND a port is present. The https rule is unchanged.

**CHOSEN OVER OPTION 5 TWICE, and the second time with full information.** The first choice
was made from four options. On 2026-09-19, after the widening had shipped, the maintainer was
told that option 5 existed, needed no widening at all, and that choosing it would mean backing
out work already done. They kept the widening. Recorded because a decision that survives its
cheaper alternative being named afterwards is a different and stronger thing than one made
before.

**The admission is made unreachable in production by validation at the source, not by
intention.** `MANAGED_APP_ORIGINS` is `jsonencode([var.managed_app_url])`, so that one
variable is the only way a value enters the deployed allowlist. It now carries a `^https://`
validation. A deployment carrying an http origin FAILS TO PLAN.

**NOT "no loopback origin can be deployed".** `https://localhost` and `https://127.0.0.1`
satisfy the validation AND the unchanged https rule. That admissibility predates this change
and is untouched by it. What is foreclosed is exactly the class this change added. An earlier
draft of this record, and of all three source comments, claimed the stronger thing.

**The duplication at two boundaries is part of the decision.** They differ by CALLER, not by
consequence: the module renders BOTH `MANAGED_APP_ORIGINS` and `MANAGED_APP_URL` from the one
variable, so each site guards the allowlist AND the Stripe return links. The root catches the
value as entered; the module catches any caller that renders the bindings. That is why the pin
test asserts both.

## Two properties of the guard as written

**The root predicate accepts a SUPERSET of what the Worker filter accepts.** It is unanchored
at the end; the filter is anchored both ends, lowercase-only and port-free. So a port, a
trailing slash, a path, userinfo or any uppercase host character plans clean and then fails the
filter, producing an EMPTY effective allowlist and a 503 on every managed route. Fails closed.
It is a property of this guard as written and NOT pre-existing: the block is new, and before it
the root validated nothing.

**Drift between the two sites is visible in ONE DIRECTION only.** If the module drifts stricter,
the root accepts a value it refuses and the plan fails loudly. If the module drifts MORE
PERMISSIVE the root refuses first, the module never sees a bad value, and the drift is
invisible. That is the direction that matters, because the module exists for a caller the root
does not stand in front of.

## Why the host literals are anchored and exact

The hosts that defeat a loose alternation CONTAIN a loopback literal.
`localhost.attacker.example` and `127.0.0.1.attacker.example` are ordinary remote hosts an
unanchored match would admit. Each is asserted refused, along with `[::1].attacker.example`,
`127.0.0.2` and `[::2]`.

Each of these eleven origins is asserted refused. Enumerated rather than counted in prose,
because the count has now gone stale twice as cases were added:

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

Cases 5 and 10 were each added during review, and for the same reason: two of the three host
literals had that case and the third did not. Both gaps were found by enumerating the set
rather than reading the list.

`localhost` is kept rather than dropped for the numeric literals alone. It is a NAME, so
resolver control could in principle make a remote page carry that Origin, but that needs
hosts-file access, browsers special-case it toward loopback, and the hazard only bites in a
deployment carrying the entry, which the validation forbids.

Recorded so the next reader need not find it: `\d{1,5}` admits `:00000` and `:99999`, which are
not valid ports. No consequence, because an entry no browser can send never matches.

## Confirmation

1. The gateway admits the three loopback origins when present in the allowlist and echoes the
   CORS header. SATISFIED 2026-09-19, written red first.
2. The gateway refuses EVERY origin in the enumerated list above. SATISFIED 2026-09-19, and
   stated as the property rather than as a count, because a count restales the moment a case
   is added — which has now happened twice.
3. A loopback entry admits only its EXACT port. SATISFIED 2026-09-19.
4. Terraform refuses a non-https `managed_app_url`. The predicate was EXECUTED: extracted into
   an isolated module and planned twice, the https default accepted and `http://127.0.0.1:9000`
   refused with the validation's own message. **Scoped: that exercised a COPY.** The root module
   cannot be planned locally without backend credentials, and no `.tftest.hcl` runs because
   nothing here invokes `terraform test`.
5. The validation's PRESENCE and SUBJECT are pinned at both sites by a test that runs. SATISFIED
   2026-09-19, mutation-proved by pointing the condition at a different variable, which reds. The
   subject is part of the pin because a pattern-only assertion survives that swap with the guard
   gone.
6. SATISFIED 2026-09-19 by commit `4d84f472`, which landed with the configurable base as this
   criterion required. A built-output test asserts the emitted account bundle carries the
   production base and no loopback one. WHICH HALF DOES THE WORK WAS MEASURED, not assumed:
   review raised that the positive assertion might be vacuous because `OVERRIDE || 'production'`
   could leave both strings in the bundle. Two builds with overrides settled it -- the `||`
   FOLDS, so the production literal is absent whenever an override is set, and the positive
   assertion therefore catches ANY override rather than only a loopback one. Proved on a
   loopback base and on `https://staging.example.com/managed`; the second reds the positive
   assertion alone, which the loopback-only negative list would have missed. The negative half
   is a belt, and its narrowness is recorded where it lives.
7. NOT SATISFIED and NOT CREATED HERE: nothing asserts that a `screens:` path in a job record
   resolves. This record's own pin test is named by such a path.

## Superseded clause, one, enumerated exactly

**ADR-095's confirmation criterion 6, in the part that is now false.** It reads: "That the
current source IS the deployed Worker was MEASURED on 2026-09-18, not reasoned: the Worker
source tree is byte-identical between HEAD and `c8d7c2f5`, the revision the last applying release
deployed from, so the diff is empty… The remaining unapplied change in the deployment tree is
comment-only in `main.tf` and has no plan effect."

**This change falsified both halves.** It edits the Worker, so the tree is no longer
byte-identical and the release deploys a new bundle alongside migration 0004; and the deployment
tree now also carries the origin widening and two validation blocks.

What is superseded is the EVIDENCE, not the conclusion. Release 1 remains forward-compatible on a
narrower argument: not "the Worker is unchanged" but "the changed Worker references neither new
column", measured by grep for `unmeterable_reason` and `unmeterable_count` over the Worker
sources, which returns nothing. ADR-093 forbids a Worker that DEPENDS on a pending migration, not
any Worker change.

ADR-095 is ratified, so this is a clause supersession rather than an edit. Everything else in it
stands.

## Reassessment Criteria

Reassess if the managed app origin needs to be more than one value, which would make the
validation the wrong shape; if a rehearsal is built needing no browser origin, which would make
the admission unnecessary; or if Clerk's `authorizedParties` handling changes such that the
allowlist stops feeding it.

## Related

- ADR-095 — the clause superseded above.
- ADR-074 — Origin as a policy signal, which this widens and why it needed a record.
- ADR-062 — hosted customer access enforced at the gateway; malformed configuration must fail
  closed, which the silent-drop filter still does.
- ADR-061 — the stable account and billing origin, which is the variable this validates.
- ADR-068 — Stripe-hosted billing interactions, whose return URLs the same variable builds.
- ADR-093 — the deploy ordering invariant, on which release 1's safety now rests.
- JTBD-403 — the pre-activation-proving outcome this serves; JTBD-005 owns the allowlist.
