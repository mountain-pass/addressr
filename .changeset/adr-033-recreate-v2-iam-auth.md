---
'@mountainpass/addressr': patch
---

Recreate the parallel v2 OpenSearch domain with IAM/SigV4 identity-scoped access (ADR 033): only the app and loader AWS identities can reach it, and a CloudWatch alarm watches the document count as an index-integrity trip-wire. Replaces the prior authentication model after it proved unreliable on the managed service. Self-hosted and local deployments are unaffected (basic auth stays the default).
