---
'@mountainpass/addressr': patch
---

Bring the Cloudflare Worker API key proxy under version control and
Terraform management (P042 / ADR 032). The worker source (entry +
CIDR-aware IP matcher + safe-list data) and a Cloudflare Terraform
module land in `deploy/cloudflare-worker/` and
`deploy/modules/cloudflare-worker/`; the RapidAPI key is now stored as
a `cloudflare_workers_secret` populated via the existing 1Password
Voder → GitHub Actions → Terraform secret flow. The previously
transient landing-pad `docs/cloudflare-worker.template.js.txt` is
removed. ADR 018 is amended to mark its line 50/63 Reassessment
Criteria resolved. The patched CIDR matcher + freshly synced UR IP
list also close out the P040 root cause once the operator runs the
one-time `terraform import` cutover documented in ADR 032 and the
first release applies.
