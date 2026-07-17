---
human-oversight: confirmed
oversight-date: 2026-07-18
status: accepted
date: 2021-01-01
decision-makers: [Tom Howard]
consulted: []
informed: []
reassessment-date: 2026-08-15
---

# ADR 018: Cloudflare Worker as API Key Proxy

> **Amendment 2026-05-15** — Two of the four Reassessment Criteria below now have explicit follow-up ADRs and are no longer open against this ADR. Line 62 ("RapidAPI key rotation … should move to Cloudflare secrets") and line 63 ("Version-controlling the worker script") are resolved by [ADR 032 (Cloudflare Worker deployed via Terraform)](032-cloudflare-worker-terraform-deploy.proposed.md), which P042 lands. Concretely:
>
> - The worker source now lives at `deploy/cloudflare-worker/{worker.js, ip-matcher.mjs, safe-ips.mjs}` and is unit-tested at `test/js/__tests__/cloudflare-worker-ip-matcher.test.mjs` — this resolves the Bad consequence at line 50 ("worker is not version-controlled"). The dashboard is no longer source of truth; the repo is, deployed via `terraform apply`.
> - The RapidAPI key moves out of source into `cloudflare_workers_secret.rapidapi_key` populated via `var.cloudflare_rapidapi_key` sourced from 1Password Voder → GHA secret `TF_VAR_cloudflare_rapidapi_key` (per `reference_addressr_secrets`) — this resolves the Bad consequence at line 48 ("RapidAPI key is hardcoded").
> - The Uptime Robot IP-list drift consequence at line 49 remains a latent operational task; ADR 032 captures a UR-IP-drift detection follow-up as out of scope for the initial migration. The drift cost is unchanged from this ADR; what changes is that the next re-sync is a PR with `terraform apply` rather than a dashboard paste.
> - The remaining Reassessment Criterion (line 60 Cloudflare Workers pricing) is still open; the line 61 Reassessment Criterion (additional consumer domains beyond the current safelist) is now a same-shape PR against `deploy/cloudflare-worker/safe-ips.mjs`.
>
> The core decision — Option 1 (Cloudflare Worker as the proxy) — is unchanged; only the deploy mechanism is documented elsewhere (ADR 032).

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
