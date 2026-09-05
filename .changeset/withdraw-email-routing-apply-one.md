---
'@mountainpass/addressr-deployment': patch
---

Withdraw the Cloudflare Email Routing declarations after apply 1 failed.

Merging the previous release ran the apply, and it failed on both halves. The
provider's `cloudflare_email_routing_settings` errors converting the API
response on a missing `support_subaddress` field — an upstream bug introduced in
5.23.0, still present in the pinned 5.24.0, with the fix unmerged. Both address
creates returned 403 because the deploy token carries no Email Routing write
scope.

Left declared, those three resources fail every subsequent release apply, so
this removal is what unblocks the release path rather than a change of
direction. Alert coverage returns to MISSING, which is the state ADR-089 already
records as accurate while the terminus is unbuilt.

This apply should be a no-op. Terraform recorded nothing for the three
resources, so the plan should show zero actions for them. **Read the plan
comment before merging: a `destroy` on any of the three would mean state was
written after all, which also answers half of an open question — whether the
enable call succeeded server-side while Terraform recorded nothing.**

The zone may now be routing-enabled with no rule, and may carry a second apex
SPF record, which is a silent permanent failure. Neither is visible from the
tree and neither is settled here.

No package or API surface changes. Nothing the live service serves is touched.
