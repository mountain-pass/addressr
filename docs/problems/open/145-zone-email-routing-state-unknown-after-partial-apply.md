# Problem 145: The zone's Email Routing state is unknown after a partially-failed apply

**Status**: Open
**Reported**: 2026-09-06
**Priority**: 9 (Medium) — Impact: Moderate (3) × Likelihood: Possible (3). Impact 3: if the enable call landed, the zone may now accept mail with no routing rule, and may carry a second apex SPF record — a permanent, silent SPF permerror that would poison the very notification terminus ADR-089 chose. Likelihood 3: the failure was a RESPONSE-conversion error, which is the shape that follows a call the server already accepted, so a landed change is at least as likely as not.
**Origin**: internal
**Effort**: S — three authenticated reads of the zone answer it, all against the same credential in one sitting.
**WSJF**: 9.0 — (9 × 1 for Open) / 1 for Effort S
**JTBD**: JTBD-403
**Persona**: addressr-maintainer

## Description

Merging release PR #543 on 2026-09-06 ran the production apply. `cloudflare_email_routing_settings.zone`
reported `Creating...` and then failed converting the API **response**, on a provider schema
mismatch (see the sibling ticket). A response-conversion failure happens _after_ the request,
so **the enable call may have succeeded server-side while Terraform recorded nothing in state.**

Terraform's own view is unhelpful: it holds no resource, so it will neither report nor reconcile
whatever is there. That was REASONED when this ticket was written and is now MEASURED — see the
section below. The declarations have since been removed, so nothing will reconcile it in future
either.

## The two hazards, both named in the code that was removed

1. **Routing enabled with no rule.** The two-apply split existed precisely to avoid this state.
   The apply may have reached it by a different road. The reasoning that it costs nothing —
   the zone's only mail path is registrar forwarding the maintainer confirmed on 2026-09-05
   reaches nobody — still holds, and is REASONED rather than observed.
2. **A second apex SPF record.** The apex already carries
   `v=spf1 include:spf.efwd.registrar-servers.com ~all`. A second `v=spf1` record on the same
   name is a permanent SPF permerror, and it fails silently. Nothing sends from the apex today,
   so nothing is broken now — but it would break the notification terminus at the moment that
   terminus is finally built, which is the worst time to discover it.

## Why this is urgent despite nothing being visibly broken

It decays in the direction of being harder to attribute. Every day that passes makes it less
clear whether a record on that zone came from this apply or from something else, and the
sibling ticket's rebuild cannot distinguish a fresh create from a repair without knowing the
starting state.

## How to settle it

Three authenticated reads of the zone answer all of it, against the same credential in one sitting:

- `GET /zones/{zone}/email/routing` — is `enabled` true, and what are `created` / `modified`?
  A `created` timestamp inside `2026-09-05T22:14:50Z`–`22:23:07Z` — the run window in the table
  below — attributes it to this apply.
- `GET /zones/{zone}/email/routing/rules` — how many rules? Expect zero.
- `GET /zones/{zone}/dns_records` — count `TXT` records on the apex whose content starts
  `v=spf1`. More than one is the permerror. Also count `MX` records and note whether any point
  at Cloudflare rather than the registrar.

The attempt on 2026-09-06 could not complete: the credential vault re-locked and the maintainer
was unavailable to unlock it.

## Half of it is now MEASURED rather than reasoned, at no credential cost

This ticket does not propose this check. Release PR #544, which carried the withdrawal, produced a Terraform plan
comment as every release PR does, and it answered the state half for free. Planned against the
merge result, it read **"No resource changes."** — zero create, update or delete actions, and in
particular no delete on any of the three. The three authenticated reads this ticket asks for are
untouched by it and all still owed.

**The ordering is load-bearing, so here it is in UTC.** BARE dates elsewhere in this ticket and
its sibling are LOCAL (AEST, UTC+10), which is why they read a day later and why a reader
comparing them against a provider timestamp will think the sequence is impossible. It is not.
Anything carrying a `Z` — including the run window quoted at the attribution step above — is
already UTC and must NOT be shifted. Note what the attribution step actually compares: a
Cloudflare `created` timestamp against a GitHub Actions run window, both in UTC.

| UTC                               | what happened                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------ |
| 2026-09-05T22:14:47Z              | release PR #543 merged — this is the apply                                           |
| 2026-09-05T22:14:50Z to 22:23:07Z | run 33995353658, which failed on the three resources                                 |
| 2026-09-05T23:12:35Z              | release PR #544 merged, carrying the withdrawal. Its plan comment predates this row. |

The plan is generated by the pull-request event, before any merge, so it is not dated by the row
above. Its instant does not matter: what makes its silence mean something is that it describes a
tree with the three blocks ALREADY REMOVED.

So **Terraform state holds nothing for any of the three resources.** The counter-reading — that
they are in state and simply match — does not survive: a tracked resource whose configuration has
gone is planned for delete, never no-op, and all three blocks are absent from the merge result.
The failed create wrote no state, which is what a response-conversion failure predicts.

**What this does NOT answer, which is the rest of the ticket.** Terraform's state saying nothing
is not the zone saying nothing. A plan reconciles configuration against state and consults the
provider only for what one of the two names, so a resource in neither is invisible to it: it would
report "no changes" whether the zone is untouched or routing-enabled with no rule. The enable call
may still have landed server-side. And whether the apex now carries a SECOND `v=spf1` record — a
silent permanent permerror if it did — is entirely untouched by this; no read of the apex since the
apply is recorded anywhere in the tree. The three reads above are still owed.

## Exit criteria

1. The three reads above performed and their results recorded in
   `docs/audits/managed-channel-launch-readiness.md`, dated, distinguishing measured from reasoned.
2. If a second apex SPF record exists, it is removed — as a declared Terraform change, not by
   hand, per the standing constraint.
3. If routing is enabled server-side and unmanaged, a decision recorded on whether to import it,
   disable it, or leave it, rather than leaving it undecided.

## Related

- The sibling ticket on the blocked Terraform route — that rebuild depends on this being settled first.
- ADR-089 — the notification decision. Unratified.
