---
'@mountainpass/addressr': patch
---

Restore the automated quarterly refresh of address data on the upgraded search backend, so address results stay current. The refresh now authenticates with short-lived, least-privilege credentials instead of a stored password. No change to the API, and self-hosted deployments are unaffected.
