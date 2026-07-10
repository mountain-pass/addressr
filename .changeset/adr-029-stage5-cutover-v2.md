---
'@mountainpass/addressr': patch
---

Cut production search over to the upgraded OpenSearch backend (ADR 029). The API now serves from the version 2.19 domain over IAM/SigV4 authentication, replacing the end-of-life 1.3.20 backend. Search latency is equal to or better than before and the full behavioural suite passes against the new engine; the change deploys with automatic rollback if the new backend is unreachable. Self-hosted deployments are unaffected (basic auth remains the default).
