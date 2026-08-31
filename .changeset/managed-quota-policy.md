---
'@mountainpass/addressr-deployment': patch
'@mountainpass/website': patch
---

Preserve each managed plan's request policy: hard limits still stop at the allowance, while pay-per-use and overage plans continue counting billable requests. Account usage now distinguishes included requests from an access limit. Existing entitlements retain their hard limits during migration; managed access remains disabled pending launch verification.
