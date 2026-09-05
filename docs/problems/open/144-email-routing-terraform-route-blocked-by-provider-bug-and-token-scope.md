# Problem 144: The Terraform route to Cloudflare Email Routing is blocked by a provider bug and a missing token scope

**Status**: Known Error
**Reported**: 2026-09-06
**Priority**: 6 (Medium) — Impact: Moderate (3) × Likelihood: Possible (2). Impact 3: it blocks the only credential-free notification terminus ADR-089 chose, and alert coverage for the managed channel stays MISSING while it holds. No live service is affected — the channel is dark and the API is untouched. Likelihood 2: the cause is established, not speculative, but the fix depends on an upstream merge nobody here controls.
**Origin**: internal
**Effort**: S for the token scope, which is a permission edit. Unknown for the provider bug, which is upstream.
**WSJF**: 12.0 — (6 × 2 for Known Error) / 1 for Effort S
**JTBD**: JTBD-403
**Persona**: addressr-maintainer

## Description

Apply 1 of the managed-channel notification was attempted on 2026-09-06 by merging release
PR #543, which is the production apply. It failed on both halves, and the two causes are
independent — fixing either alone does not unblock it.

**Cause 1, upstream and not ours.** `cloudflare_email_routing_settings` errors during create:

> Value Conversion Error … mismatch between struct and object: Struct defines fields not
> found in object: support_subaddress.

This is `cloudflare/terraform-provider-cloudflare` issue 7301, open, introduced in provider
5.23.0. It is present in 5.24.0, which is the latest 5.x and what `.terraform.lock.hcl`
carries. Fix PR 7302 is open and unmerged. The issue's stated workaround is to pin below
5.23.0.

**Cause 2, ours.** Both `cloudflare_email_routing_address` creates returned:

> 403 Forbidden … {"code":10000,"message":"Authentication error"} on
> POST /accounts/{id}/email/routing/addresses

The deploy token has no Email Routing write scope. This was listed as unverified before the
apply; it is now measured.

## What was done immediately, and why

The three resource declarations were removed from `apps/addressr-deployment/main.tf` the same
day. Not a reversal of ADR-089 — the decision's own Outcome already records alert coverage as
MISSING until the terminus is built, so removal returns the tree to the state that decision
describes as accurate.

Removal was urgent for a reason unrelated to the notification: **left declared, they fail every
subsequent release apply.** The release path was blocked for all future work until they went.

## Why not the alternatives

**Pin the provider below 5.23.0.** `versions.tf` pins `~> 5.0`, and that provider serves the D1
database, the Worker script and route, Pages, and the imported root DNS record. Narrowing it is
a new cross-cutting constraint over four decisions none of which pins a version, and would
itself be a decision needing a record. Too much blast radius for a channel that is dark.

**Enable it by hand in the dashboard.** Collides with the standing maintainer constraint —
Terraform-declared, pipeline-applied, no hand mutation of provider configuration — and would
manufacture exactly the hazard the removed blocks' own `prevent_destroy` reasoning is about:
human-verified state Terraform does not know it owns.

## Exit criteria

1. Upstream PR 7302 merged and released, and the lockfile moved to a version carrying it — OR a
   version pin decided and recorded as its own decision.
2. The deploy token carries Email Routing write scope, verified by an apply that reaches the
   address creates rather than by reading the token's configuration.
3. ADR-089 ratified before anything is rebuilt. Declaring these against an unconfirmed decision
   is the exposure ADR-074 exists to close, and the ratification drain is where the finding in
   this ticket gets weighed against the decision that produced it.
4. The zone-state question in the sibling ticket settled first — a rebuild against an unknown
   starting state cannot tell a fresh create from a repair.

## Related

- ADR-089 — the notification decision this implements. Unratified.
- ADR-074 — confirm a decision's substance before building dependent work.
- ADR-051 — the comment left in `main.tf` points here; it is not itself the record.
- `test/js/__tests__/managed-channel-notification-terraform.test.mjs` — now asserts the
  resources are ABSENT, so a rebuild that skips this ticket reds.
