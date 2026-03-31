---
status: accepted
date: 2021-01-01
decision-makers: [Tom Howard]
consulted: []
informed: []
---

# ADR 018: Cloudflare Worker as API Key Proxy

## Context and Problem Statement

The addressr.io website and Uptime Robot need to call the addressr API without exposing the RapidAPI API key in client-side code or monitor configurations. A server-side proxy is needed to inject the key.

## Decision Drivers

- RapidAPI API key must not be exposed in browser JavaScript
- Uptime Robot needs an unauthenticated endpoint to monitor
- Low latency proxy close to end users (Cloudflare edge network)
- Minimal infrastructure to maintain

## Considered Options

1. **Cloudflare Worker** -- edge proxy that injects the RapidAPI key
2. **AWS API Gateway** -- proxy in the same region as Elastic Beanstalk
3. **Self-hosted reverse proxy** -- nginx/Caddy on a separate instance

## Decision Outcome

**Option 1: Cloudflare Worker** (`cool-bush-ca66`). Deployed on the Windy Road Cloudflare account. The worker:

1. Receives requests at `cool-bush-ca66.addressr-key-provider.workers.dev`
2. Checks the `Referer` header against a safelist: `addressr.io`, `localhost`, `addressr.mountain-pass.com.au`, `addressr.mountainpass.com.au`
3. Allows Uptime Robot IPs through without referer check (IP allowlist maintained in the worker script)
4. Rewrites the request hostname to `addressr.p.rapidapi.com`
5. Injects `x-rapidapi-key` and `x-rapidapi-host` headers
6. Proxies the response back to the caller

This enables:
- **addressr.io website**: calls the API from JavaScript without exposing the RapidAPI key
- **Uptime Robot**: monitors `/addresses/GANSW718804790` without needing RapidAPI credentials (see ADR 016)

### Consequences

- Good: RapidAPI key is server-side, not exposed to browsers
- Good: Cloudflare edge network provides low latency globally
- Good: Uptime Robot can monitor without API key management
- Bad: RapidAPI key is hardcoded in the worker script rather than using Cloudflare secrets/env vars
- Bad: Uptime Robot IP allowlist must be manually maintained when Uptime Robot adds new IPs
- Bad: The worker is not version-controlled — it exists only in Cloudflare's platform

### Confirmation

- `curl https://cool-bush-ca66.addressr-key-provider.workers.dev/` returns the API root
- Uptime Robot monitor shows 100% uptime (7d) at this endpoint
- Requests without a valid referer or IP are rejected with 401

### Reassessment Criteria

- Cloudflare Workers pricing changes
- Need to support additional consumer domains beyond the current safelist
- RapidAPI key rotation (currently hardcoded — should move to Cloudflare secrets)
- Version-controlling the worker script (currently only in Cloudflare dashboard)

## Related

- ADR 016: Uptime Robot monitors through this worker
- ADR 017: RapidAPI is the upstream API gateway this worker proxies to
