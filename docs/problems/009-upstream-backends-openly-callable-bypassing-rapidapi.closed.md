# Problem 009: Upstream backends are openly callable, enabling bypass of RapidAPI gateway

**Status**: Closed
**Reported**: 2026-04-15
**Priority**: 9 (Medium) — Impact: Moderate (3) x Likelihood: Possible (3)

## Description

The Express origin is deployed at two directly-addressable hostnames:

- `https://backend.addressr.io`
- `https://backend2.addressr.io`

Both hostnames accept unauthenticated requests with permissive CORS (`access-control-allow-origin: *`) and return full API responses. This permits any caller who discovers either hostname to invoke the API without going through the RapidAPI gateway — bypassing key validation, quota enforcement, and revenue accounting.

Hostname discovery is already trivial today: the Cloudflare Worker (ADR 018) contains the upstream hostname in its source; DNS records are public; and we are about to publish both hostnames in the `servers:` block of the OpenAPI spec (P008 follow-up) to prevent future OAS3 import breakage. P008's post-mortem formally identified this as a latent risk that should be addressed.

The fix must handle multiple deployment topologies without vendor lock-in to any single gateway. ADR 017 documents Mountain Pass's current choice of RapidAPI, but the origin's enforcement mechanism should be **gateway-agnostic** so operators can front Addressr with any reverse proxy (Kong, Tyk, Apigee, AWS API Gateway, nginx, Caddy, their own Cloudflare Worker, a bespoke internal gateway) or run self-hosted with no front at all.

Proposed mechanism: configure both the **header name** and the **expected value** via environment variables.

| Env var                      | Default | Purpose                                                                                                               |
| ---------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| `ADDRESSR_PROXY_AUTH_HEADER` | unset   | Name of the header the origin checks (e.g. `X-RapidAPI-Proxy-Secret`, `X-Gateway-Token`, or any operator-chosen name) |
| `ADDRESSR_PROXY_AUTH_VALUE`  | unset   | Expected value the header must carry                                                                                  |

Behaviour:

- **Both unset** → no enforcement (self-hosted default — npm `@mountainpass/addressr`, Docker `mountainpass/addressr`, local dev)
- **Both set** → middleware rejects requests that do not present the configured header with the configured value
- **Exactly one set** → startup error (fail loud; misconfiguration must not silently allow bypass)

Supported deployment profiles:

| Topology                              | Header                       | Value                                           |
| ------------------------------------- | ---------------------------- | ----------------------------------------------- |
| Self-hosted (npm/Docker/local)        | unset                        | unset                                           |
| RapidAPI-fronted (Mountain Pass prod) | `X-RapidAPI-Proxy-Secret`    | RapidAPI's secret (Gateway → Firewall Settings) |
| Kong / Tyk / Apigee / AWS API Gateway | whatever the gateway injects | shared secret                                   |
| nginx / Caddy reverse proxy           | operator-chosen              | shared secret                                   |
| Cloudflare Worker (own)               | operator-chosen              | shared secret                                   |

The actual secret value(s) live in the deployment's environment (AWS Elastic Beanstalk env, Cloudflare Worker config, or wherever the chosen gateway injects them) — **not in this repo, not in any committed file, and not in any problem ticket**. RISK-POLICY.md "Confidential Information" section forbids committing secrets to the repository.

## Symptoms

- `curl https://backend.addressr.io/addresses?q=sydney` returns 200 with full results, no credentials required.
- `curl https://backend2.addressr.io/addresses?q=sydney` returns 200 with full results.
- A consumer aware of these hostnames can call the API indefinitely without an active RapidAPI subscription, bypassing all plan gating and quotas.
- The hostnames are referenced in the Cloudflare Worker source (ADR 018), documented in ADRs 017 and 018, and will be in the OpenAPI `servers:` block post-P008 fix.
- No current monitoring detects bypass traffic; AWS access logs capture it but nobody is aggregating against expected per-plan volumes.

## Workaround

None. The bypass risk is latent and systemic; no runtime mitigation is available without implementing the fix.

## Impact Assessment

- **Who is affected**: Mountain Pass (revenue capture — paid RapidAPI subscribers who choose to bypass, or unauthenticated callers who consume compute without contributing). RapidAPI plan gating is currently ineffective against informed bypass. Self-hosters are unaffected by the current state and must remain unaffected by the fix.
- **Frequency**: Continuous latent exposure. Unknown current exploitation level — no instrumentation distinguishes legitimate (via-RapidAPI) vs bypass (direct) traffic on AWS.
- **Severity**: Moderate. No immediate service outage; user-facing paths work normally. Business risk is revenue leakage, growing as hostnames become more discoverable through the Cloudflare Worker source, DNS scanning, and the upcoming OpenAPI `servers:` publication.
- **Analytics**: AWS CloudWatch/ALB logs capture raw requests; would need to filter by absence of `X-RapidAPI-Proxy-Secret` header to quantify bypass traffic, but the origin doesn't currently log that header.

## Root Cause Analysis

### Root Cause (design)

ADR 017 (RapidAPI distribution) positions RapidAPI as the monetization gateway but does not specify an enforcement mechanism at the origin. The origin has no authentication, no header-based gating, and no coupling to the RapidAPI Proxy Secret that RapidAPI itself advertises. The chain's weakest link is the openly-accessible upstream.

### Fix Strategy (to be ratified via ADR 024)

Gateway-agnostic opt-in header enforcement at the Express origin:

1. Read `ADDRESSR_PROXY_AUTH_HEADER` and `ADDRESSR_PROXY_AUTH_VALUE` from environment at boot.
2. If both unset (self-hosted default): no enforcement; all routes behave as today.
3. If exactly one set: fail the process startup with a clear error (partial configuration is never safe).
4. If both set (any fronted deployment): a middleware rejects requests whose configured header does not equal the configured value with 401 (or 403 — ADR 024 to decide).
5. **Bypass allowlist** — certain routes must remain open regardless of enforcement:
   - `/health` — UptimeRobot monitors through the Cloudflare Worker today, but operational monitoring or diagnostics may hit `/health` directly without the gateway.
   - `/api-docs` — RapidAPI's OAS3 re-import (and equivalent import flows on other gateways) fetches this and will not carry the secret; must remain unauthenticated (per ADR 023).
6. For Mountain Pass production (RapidAPI-fronted): set `ADDRESSR_PROXY_AUTH_HEADER=X-RapidAPI-Proxy-Secret` and `ADDRESSR_PROXY_AUTH_VALUE=<RapidAPI's configured secret>` in the AWS Elastic Beanstalk environment via the existing `deploy/` Terraform or the EB console. Values kept out of the repo.
7. For operators fronting with other gateways: set the pair to whatever their gateway injects.
8. Verify post-deploy with a synthetic probe with and without the header; expect 200 with, 401/403 without.

### Architect's pre-implementation asks (already raised)

- New ADR 024: "Origin enforces a configurable gateway auth header when fronted". Must cover env-var names (`ADDRESSR_PROXY_AUTH_HEADER`, `ADDRESSR_PROXY_AUTH_VALUE`), opt-in default, partial-config failure mode (startup error), request-rejection failure mode (401 vs 403), allowlisted routes (`/health`, `/api-docs`), logging, and interaction with ADRs 013/016/017/018. Must explicitly note the mechanism is gateway-agnostic — RapidAPI is just one of several documented deployment profiles (Kong, Tyk, Apigee, AWS API Gateway, nginx/Caddy, own Cloudflare Worker, self-hosted).
- Update ADR 017 or add explicit job in `docs/JOBS_TO_BE_DONE.md` documenting "protect the chosen monetization/access gateway" as a business control (phrased generically, not RapidAPI-specific).
- Update `/api-docs` `info.description` to note that production access requires the operator's chosen gateway (by default, a RapidAPI subscription for the Mountain Pass service) and direct upstream URLs are for gateway configuration only.

### Investigation Tasks

- [x] Author `docs/decisions/024-origin-gateway-auth-header-enforcement.proposed.md` — landed in commit 6fd4252 (MADR 4.0, 6 options, gateway-agnostic, 5 deployment profiles documented)
- [x] Update `docs/JOBS_TO_BE_DONE.md` with a "protect the chosen gateway" job (gateway-agnostic wording) — added J6 and Persona 3 amendment
- [x] Update `/api-docs` `info.description` text in `src/waycharter-server.js` to describe direct-URL usage
- [x] Create failing cucumber scenarios covering default-off, enforcement-rejects-wrong/missing, enforcement-accepts-correct, and `/health` + `/api-docs` allowlist — `test/resources/features/proxy-auth-enforcement.feature` (6 scenarios) with step definitions in `test/js/steps-proxy-auth.js`
- [x] Create failing unit test for partial-config startup failure (both-vars-set and neither is fine; exactly-one-set must error) — `test/js/proxy-auth.test.js`
- [x] Create tests confirming `/health` and `/api-docs` remain unauthenticated even when enforcement is on — included in both the feature file and the unit test
- [x] Implement the middleware in the Express origin — `src/proxy-auth.js` (`validateProxyAuthConfig`, `proxyAuthMiddleware`); wired into `src/waycharter-server.js` after CORS middleware and before `waycharter.router`
- [x] Update `README.md` / self-hosting docs to describe the two env vars and list deployment profiles
- [ ] Set the pair in AWS EB env for the Mountain Pass RapidAPI-fronted deployment (via `deploy/` Terraform vars or EB console) — values kept out of repo
- [ ] Verify in production with synthetic probes (direct, with header; direct, without header; via RapidAPI; via worker)
- [ ] Add synthetic monitoring that exercises both the via-gateway path and a direct-without-header probe — the former should 200, the latter should 401
- [ ] Promote ADR 024 `proposed` → `accepted` after production verification (per DECISION-MANAGEMENT.md)
- [ ] Once deployed and verified: add `## Fix Released` section here and await user confirmation before closing

## Fix Released

- **Released**: 2026-04-15 in v2.1.5.
- **Mechanism**: Terraform applied `ADDRESSR_PROXY_AUTH_HEADER=X-RapidAPI-Proxy-Secret` and `ADDRESSR_PROXY_AUTH_VALUE=<RapidAPI Proxy Secret>` to the AWS Elastic Beanstalk `addressr-prod` environment. Values sourced from GitHub Actions repo secrets `TF_VAR_PROXY_AUTH_HEADER` and `TF_VAR_PROXY_AUTH_VALUE`, themselves sourced from the 1Password Voder-vault item `Addressr RapidAPI Proxy Secret`.
- **Confirmation**: Post-deploy smoke test in the v2.1.5 release workflow run reported `direct probe status 401 (acceptable during rollout)` for `https://backend.addressr.io/addresses?q=sydney` without the header; `/health` and `/api-docs` returned 200 (allowlist intact). Operator manually verified the RapidAPI-fronted path `addressr.p.rapidapi.com/addresses?q=sydney` returns 200 on 2026-04-15.
- **ADR**: [ADR 024](../decisions/024-origin-gateway-auth-header-enforcement.accepted.md) promoted from `proposed` → `accepted` in the same change.
- **Follow-ups open**: smoke probe tightened from `200|401` tolerant to `401` required in the same commit. P010 continues to track the cli2 cucumber harness limitation.

## Related

- [ADR 017](../decisions/017-rapidapi-distribution.accepted.md) — RapidAPI as monetization gateway (this problem exposes a gap in its enforcement)
- [ADR 018](../decisions/018-cloudflare-worker-api-proxy.accepted.md) — Cloudflare Worker key proxy (references the upstream hostnames this problem seeks to protect)
- [ADR 023](../decisions/023-openapi-spec-rapidapi-ci-sync.proposed.md) — OpenAPI spec sync (imposes constraint that `/api-docs` must remain unauthenticated)
- [ADR 024](../decisions/024-origin-gateway-auth-header-enforcement.accepted.md) — accepted with v2.1.5; records the gateway-agnostic enforcement decision this problem required
- [Problem 008](008-rapidapi-gateway-rejecting-all-keys-for-listing.known-error.md) — upstream outage post-mortem; formally flagged this as a follow-up and drove the urgency of fixing it before P008's `servers:` change widens discoverability
- [RISK-POLICY.md](../../RISK-POLICY.md) — "Confidential Information" section; proxy secret value must not be committed
