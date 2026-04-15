---
'@mountainpass/addressr': patch
---

feat(origin): opt-in gateway auth header enforcement (ADR 024, P009)

Adds `ADDRESSR_PROXY_AUTH_HEADER` and `ADDRESSR_PROXY_AUTH_VALUE` env vars. Both unset (default) keeps current behaviour — self-hosted npm and Docker deployments are unaffected. Set both to reject requests that do not present the configured header; `/health` and `/api-docs` remain allowlisted so monitors and gateway OpenAPI imports keep working. Setting exactly one fails startup to prevent silent bypass.
