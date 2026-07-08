---
'@mountainpass/addressr': patch
---

Enable read-shadow warming for the v2 OpenSearch migration (ADR 029 Stage 3). Production search traffic is mirrored fire-and-forget to the v2 domain to warm its caches before cutover, authenticated by IAM/SigV4 (ADR 033). The primary path and live responses are unaffected; self-hosted deployments are unchanged (shadow stays off by default).
