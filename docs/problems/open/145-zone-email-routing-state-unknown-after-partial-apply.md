# Problem 145: The zone's Email Routing state is unknown after a partially-failed apply

**Status**: Open
**Reported**: 2026-09-06
**Priority**: 8 (Medium) — Impact: Moderate (3) × Likelihood: Possible (3). Impact 3: if the enable call landed, the zone may now accept mail with no routing rule, and may carry a second apex SPF record — a permanent, silent SPF permerror that would poison the very notification terminus ADR-089 chose. Likelihood 3: the failure was a RESPONSE-conversion error, which is the shape that follows a call the server already accepted, so a landed change is at least as likely as not.
**Origin**: internal
**Effort**: S — one authenticated read of the zone answers it.
**WSJF**: 9.0 — (9 × 1 for Open) / 1 for Effort S
**JTBD**: JTBD-403
**Persona**: addressr-maintainer

## Description

Merging release PR #543 on 2026-09-06 ran the production apply. `cloudflare_email_routing_settings.zone`
reported `Creating...` and then failed converting the API **response**, on a provider schema
mismatch (see the sibling ticket). A response-conversion failure happens _after_ the request,
so **the enable call may have succeeded server-side while Terraform recorded nothing in state.**

Terraform's own view is unambiguous and unhelpful: it holds no resource, so it will neither
report nor reconcile whatever is there. The declarations have since been removed, so nothing
will reconcile it in future either.

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

One authenticated read of the zone answers all of it:

- `GET /zones/{zone}/email/routing` — is `enabled` true, and what are `created` / `modified`?
  A `created` timestamp of 2026-09-06 around 22:23 UTC attributes it to this apply.
- `GET /zones/{zone}/email/routing/rules` — how many rules? Expect zero.
- `GET /zones/{zone}/dns_records` — count `TXT` records on the apex whose content starts
  `v=spf1`. More than one is the permerror. Also count `MX` records and note whether any point
  at Cloudflare rather than the registrar.

The attempt on 2026-09-06 could not complete: the credential vault re-locked and the maintainer
was unavailable to unlock it.

A free partial answer is available without credentials: the next release PR's Terraform plan
comment. Terraform recorded nothing, so it should show **zero** actions for all three removed
resources. If it shows a `destroy` for any of them, state _was_ written, which answers half the
question at no cost.

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
