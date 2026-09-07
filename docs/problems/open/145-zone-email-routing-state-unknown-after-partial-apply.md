# Problem 145: The zone's Email Routing state is unknown after a partially-failed apply

**Status**: Open
**Reported**: 2026-09-06
**Priority**: 6 (Medium) — Impact: Minor (2) × Likelihood: Possible (3). RE-DERIVED 2026-09-06 after the authoritative DNS read, down from 9 (Impact 3). Half the original Impact-3 ground is measured away: there is no second apex SPF record, so the permanent silent permerror that would have poisoned the notification terminus ADR-089 chose does not exist. The surviving ground is also narrower than it was written: the zone may have routing ENABLED with no rule, but its MX records still point at the registrar's forwarding hosts and not at any Cloudflare route target, so nothing is currently intercepting mail and no inbound mail is at risk today. What remains is unmanaged account-side state that Terraform does not know about and that would matter when the route is finally configured — real, and worth settling before then, but not a live mail hazard. Likelihood 3: the failure was a RESPONSE-conversion error, which is the shape that follows a call the server already accepted, so a landed change is at least as likely as not.
**Origin**: internal
**Effort**: S — TWO authenticated reads of the zone answer it, down from three: the DNS read was discharged 2026-09-06 by public DNS at no credential cost. Both remaining reads are Email Routing API calls against the same credential in one sitting.
**WSJF**: 6.0 — (6 × 1 for Open) / 1 for Effort S. Recomputed 2026-09-06 with the Priority above; Effort stays S.
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

TWO authenticated reads of the zone answer what is left, against the same credential in one sitting. It was three until 2026-09-06, when the third was discharged by substitution: public DNS answered both of its questions at no credential cost. The list below is retained in full, with the discharged read marked, because renumbering it would break the references elsewhere in this ticket:

- `GET /zones/{zone}/email/routing` — is `enabled` true, and what are `created` / `modified`?
  A `created` timestamp inside `2026-09-05T22:14:50Z`–`22:23:07Z` — the run window in the table
  below — attributes it to this apply.
- `GET /zones/{zone}/email/routing/rules` — how many rules? Expect zero.
- ~~`GET /zones/{zone}/dns_records`~~ — **DISCHARGED 2026-09-06 BY SUBSTITUTION OF METHOD.**
  It asked two things and public DNS answered both at no credential cost, read from the zone's
  own authoritative nameservers rather than a recursive resolver: exactly ONE apex `v=spf1`
  record, so not the permerror this ticket feared, and the `MX` records still the registrar's
  five forwarding hosts with no Cloudflare route target among them. Retained in place rather
  than deleted so the numbering above it does not shift.

The attempt on 2026-09-06 could not complete: the credential vault re-locked and the maintainer
was unavailable to unlock it.

## Half of it is now MEASURED rather than reasoned, at no credential cost

This ticket does not propose this check. Release PR #544, which carried the withdrawal, produced a Terraform plan
comment as every release PR does, and it answered the state half for free. Planned against the
merge result, it read **"No resource changes."** — zero create, update or delete actions, and in
particular no delete on any of the three resources. The authenticated reads this ticket asks for
are untouched by it and still owed: TWO of them, since the third was discharged 2026-09-06 by a
public DNS read at no credential cost. This sentence said "three ... and all still owed" through
two earlier correction passes of this same count, which is why the number is now stated once here
and derived from the list above rather than restated.

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
silent permanent permerror if it did — is entirely untouched by this.

**AMENDED 2026-09-06: the SPF read has since happened, and this ticket is down to two owed
reads rather than three.** The apex was read from the zone's own authoritative nameservers,
`lisa.ns.cloudflare.com` and `woz.ns.cloudflare.com`, and both return exactly ONE apex
`v=spf1` record at TTL 300 — so no duplicate, and not the permerror this ticket feared. Read
authoritatively rather than through a recursive resolver on purpose: a resolver can serve an
answer cached from before the apply, which would have been evidence about the past. The MX
records are still the registrar's forwarding hosts with no Cloudflare route target, so Email
Routing's DNS is unconfigured too. Recorded in full in the launch-readiness ledger, which
exit criterion 1 below nominates.

The third owed read — `GET /zones/{zone}/dns_records`, asking for the apex `v=spf1` count and
whether any MX points at Cloudflare — is therefore DISCHARGED BY SUBSTITUTION OF METHOD:
public DNS answered both of its questions at no credential cost. Exit criterion 2 is
discharged vacuously, there being no second record to remove. What survives is the two
authenticated Email Routing API reads, and with them the whole of the impact ground that
still stands: whether the failed create left routing ENABLED server-side with no rule. That
is account-side state with no public projection, so no DNS read can reach it.

## Exit criteria

1. The two remaining reads above performed and their results recorded in
   `docs/audits/managed-channel-launch-readiness.md`, dated, distinguishing measured from reasoned.
2. If a second apex SPF record exists, it is removed — as a declared Terraform change, not by
   hand, per the standing constraint.
3. If routing is enabled server-side and unmanaged, a decision recorded on whether to import it,
   disable it, or leave it, rather than leaving it undecided.

## Related

- The sibling ticket on the blocked Terraform route — that rebuild depends on this being settled first.
- ADR-089 — the notification decision. Ratified 2026-09-07; it does not settle this ticket, whose subject is the zone's state rather than the decision's standing.
