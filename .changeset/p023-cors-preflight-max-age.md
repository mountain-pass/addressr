---
'@mountainpass/addressr': patch
---

When CORS is enabled (`ADDRESSR_ACCESS_CONTROL_ALLOW_ORIGIN` set), answer CORS preflight (`OPTIONS`) requests with `Access-Control-Max-Age` and `Access-Control-Allow-Methods` so cross-origin browsers cache the preflight instead of re-running it before every request. Two new operator-configurable env vars: `ADDRESSR_ACCESS_CONTROL_MAX_AGE` (default `86400`) and `ADDRESSR_ACCESS_CONTROL_ALLOW_METHODS` (default `GET,OPTIONS`). The preflight is answered `204` ahead of proxy-auth enforcement, so an unauthenticated `OPTIONS` is no longer rejected; data-carrying methods remain enforced. When CORS is not configured the preflight-cache handler is inert (no `Access-Control-Max-Age`), so self-hosted deployments with no CORS config are unaffected.
