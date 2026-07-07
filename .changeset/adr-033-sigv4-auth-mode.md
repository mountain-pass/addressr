---
'@mountainpass/addressr': patch
---

Add an optional IAM/SigV4 authentication mode for the OpenSearch client (ADR 033). Set `ELASTIC_AUTH_MODE=sigv4` (and `ELASTIC_REGION`) to sign requests with AWS IAM credentials instead of basic auth; the read-shadow client has a matching `ADDRESSR_SHADOW_AUTH_MODE`. Both default to basic auth, so self-hosted and local deployments are unchanged.
