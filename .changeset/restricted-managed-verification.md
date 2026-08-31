---
'@mountainpass/addressr-deployment': patch
---

Restrict managed account and API access to explicitly allowed organisations for operator verification. Missing or invalid configuration denies access before account storage or customer usage; existing identity, subscription and quota checks still apply. Managed access remains disabled, and this release does not activate billing or public signup. RapidAPI, demo, monitoring and signed webhook handling are unchanged.
