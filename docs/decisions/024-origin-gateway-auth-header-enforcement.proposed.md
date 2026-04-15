---
status: 'proposed'
date: 2026-04-15
decision-makers: [Tom Howard]
consulted: []
informed: []
reassessment-date: 2026-07-15
---

# ADR 024: Origin Gateway Auth Header Enforcement

## Context and Problem Statement

Addressr's Express origin is deployed at directly-addressable upstream hostnames (`backend.addressr.io`, `backend2.addressr.io`) with permissive CORS and no authentication. ADR 017 places RapidAPI as the monetization gateway, but the origin has no coupling to that gateway — anyone who discovers the upstream hostnames can call the API without going through RapidAPI, bypassing key validation, plan gating, and revenue accounting. Discovery is already trivial: hostnames are in the Cloudflare Worker source (ADR 018), in public DNS, and will be published in the OpenAPI `servers:` block after the P008 follow-up (to prevent future OAS3 import breakage).

The origin is shipped through three distribution channels (ADR 013 Docker, ADR 017 RapidAPI-fronted hosted service, plus the `@mountainpass/addressr` npm package). Self-hosted users do not have a gateway in front and must not be broken by any new enforcement. Operators who front Addressr with gateways other than RapidAPI (Kong, Tyk, Apigee, AWS API Gateway, nginx/Caddy, their own Cloudflare Worker) must not be locked into RapidAPI's header naming.

A decision is needed now because problem P008 (2026-04-14 outage) recommended closing this bypass before the `servers:` change widens upstream discoverability, and problem P009 is tracking the work.

## Decision Drivers

- **Must not break self-hosted deployments.** `@mountainpass/addressr` npm and `mountainpass/addressr` Docker consumers run without any gateway; default behaviour must be "no enforcement".
- **Must not lock operators into RapidAPI.** ADR 017 is the current choice, not a mandated one. A future operator may front Addressr with another gateway; enforcement mechanism must be gateway-agnostic.
- **Must not silently allow bypass on misconfiguration.** A half-configured origin that accepts unauthenticated requests despite the operator intending enforcement is a monetization and security failure.
- **Must allow gateway-facing discovery endpoints to remain open.** `/api-docs` is fetched by RapidAPI's OAS3 import (ADR 023) and by equivalent flows on other gateways, without the shared secret. `/health` is commonly monitored directly.
- **Secret value(s) must never be committed to the repository.** RISK-POLICY.md "Confidential Information" section is authoritative.
- **Should be cheap to implement.** An Express middleware — not infrastructure re-architecture — is preferred for this iteration.

## Considered Options

1. **Opt-in env-var pair (`ADDRESSR_PROXY_AUTH_HEADER` + `ADDRESSR_PROXY_AUTH_VALUE`)** — origin enforces a configurable header at the middleware layer.
2. **Always-on bootstrap token baked into the origin** — every origin instance requires a secret, provisioned at deploy time; self-hosters must supply one even for purely local use.
3. **Network-level restriction via AWS Security Group / Cloudflare IP allowlist** — only the chosen gateway's IP ranges can reach the origin; no application-layer secret.
4. **mTLS between gateway and origin** — gateway presents a client certificate on every forwarded request; origin validates.
5. **Signed-request / HMAC with timestamp** — gateway signs each request with a shared secret and a timestamp; origin verifies signature and rejects replays.
6. **Do nothing — accept the bypass risk.** The current state; P009 quantifies it.

## Decision Outcome

Chosen option: **"Option 1 — Opt-in env-var pair"**, because it is the only option that satisfies all decision drivers simultaneously:

- **Self-hosted default-off.** Both env vars unset → middleware is a no-op; existing npm/Docker consumers are untouched.
- **Gateway-agnostic.** Header name and expected value are both configurable, so RapidAPI, Kong, Apigee, nginx, Caddy, or a bespoke Cloudflare Worker can each be fronted without code changes.
- **Fail-loud partial config.** If exactly one of the pair is set, the process fails to start with a clear error (prevents silent bypass).
- **Cheap.** One Express middleware, one boot-time config check, allowlist for `/health` and `/api-docs`.
- **Reversible.** Unsetting both vars returns to the pre-change behaviour without a code roll-back.

Options 2–6 are rejected in the "Pros and Cons of the Options" section below.

### Why HTTP 401 (not 403)

Per RFC 7235 §3.1, **401 Unauthorized** means "the request has not been applied because it lacks valid authentication credentials". **403 Forbidden** means "the server understood the request but refuses to authorize it" — i.e., the caller is authenticated but not permitted. The origin cannot identify the caller; it only validates presence of a shared gateway secret. A missing or wrong header therefore indicates absent authentication, not denied authorization. 401 is the correct status.

### Configuration

| Env var                      | Default | Purpose                                                                                  |
| ---------------------------- | ------- | ---------------------------------------------------------------------------------------- |
| `ADDRESSR_PROXY_AUTH_HEADER` | unset   | Name of the header the origin checks (e.g. `X-RapidAPI-Proxy-Secret`, `X-Gateway-Token`) |
| `ADDRESSR_PROXY_AUTH_VALUE`  | unset   | Expected value the header must carry                                                     |

The `ADDRESSR_` prefix is consistent with existing conventions (`ADDRESSR_ACCESS_CONTROL_ALLOW_ORIGIN`, `ADDRESSR_ENABLE_GEO`, etc.) per `deploy/main.tf`.

### Behaviour

- **Both unset** → no enforcement; all routes behave as today (self-hosted default).
- **Both set** → middleware rejects requests whose configured header does not equal the configured value with **HTTP 401** and a short JSON body `{"message":"Authentication required"}`.
- **Exactly one set** → process fails at startup with a non-zero exit code. The error message must name **both** env vars and identify **which** is missing, so operators can diagnose without tracing source.
- **Allowlist (routes exempt from enforcement):** `/health`, `/api-docs`. These routes expose no user data and are consumed by infrastructure (monitoring, gateway imports) that cannot carry the secret. **The allowlist is a closed list defined in code, not operator-configurable**, to prevent accidental widening.

### Supported deployment profiles

| Topology                              | `ADDRESSR_PROXY_AUTH_HEADER`  | `ADDRESSR_PROXY_AUTH_VALUE` |
| ------------------------------------- | ----------------------------- | --------------------------- |
| Self-hosted (npm/Docker/local dev)    | unset                         | unset                       |
| RapidAPI-fronted (Mountain Pass prod) | `X-RapidAPI-Proxy-Secret`     | RapidAPI-provided secret    |
| Kong / Tyk / Apigee / AWS API Gateway | whatever that gateway injects | shared secret               |
| nginx / Caddy reverse proxy           | operator-chosen               | shared secret               |
| Own Cloudflare Worker (per ADR 018)   | operator-chosen               | shared secret               |

## Consequences

### Good

- Closes the upstream bypass for any deployment that opts in, without forcing a specific gateway vendor.
- Preserves zero-config self-hosted behaviour.
- Publishing upstream hostnames in the OpenAPI `servers:` block (P008 follow-up) becomes safe.
- Gateway-agnostic naming means no future ADR supersession if Mountain Pass ever migrates off RapidAPI.
- Implementation is a single middleware; small surface area to review and test.

### Neutral

- Introduces two new env vars that self-hosters need to _not_ set (documentation task). Most users will never touch them.
- RapidAPI's Proxy Secret still lives in RapidAPI's dashboard and in the origin's env; rotation becomes a two-step operation (RapidAPI → AWS EB env), same as today for the Cloudflare Worker's hardcoded key (ADR 018).

### Bad

- The origin gains one more failure mode: a misconfigured operator who only sets one of the pair loses service until they either set both or unset both. Mitigated by fail-loud at startup rather than silent acceptance.
- Allowlisting `/api-docs` means the spec itself remains world-readable, which is already the case today and is required for ADR 023's import flow.
- This is a shared-secret mechanism; it does not provide per-caller accountability at the origin. If finer-grained accountability is ever needed, a follow-up ADR would introduce per-caller tokens or mTLS. Accepted for this iteration as revenue protection is the business goal, not per-caller audit.

## Confirmation

Implementation is compliant when all of the following hold:

1. With both env vars unset, every route returns the same responses as before this ADR. The existing cucumber suite passes without modification.
2. With `ADDRESSR_PROXY_AUTH_HEADER=X-Test-Header` and `ADDRESSR_PROXY_AUTH_VALUE=s3cr3t` set:
   - `GET /addresses?q=sydney` without the header → **401** `{"message":"Authentication required"}`.
   - `GET /addresses?q=sydney` with header `X-Test-Header: wrong` → **401**.
   - `GET /addresses?q=sydney` with header `X-Test-Header: s3cr3t` → **200** with results.
   - `GET /health` without the header → **200**.
   - `GET /api-docs` without the header → **200** with the OpenAPI JSON.
3. With only `ADDRESSR_PROXY_AUTH_HEADER` set (value missing) → process fails at startup with a non-zero exit code and an error message that names both env vars and states that `ADDRESSR_PROXY_AUTH_VALUE` is missing.
4. With only `ADDRESSR_PROXY_AUTH_VALUE` set (header missing) → process fails at startup with a non-zero exit code and an error message that names both env vars and states that `ADDRESSR_PROXY_AUTH_HEADER` is missing.
5. In the Mountain Pass production AWS Elastic Beanstalk environment, both env vars are set (header = `X-RapidAPI-Proxy-Secret`, value = RapidAPI's current secret). A synthetic probe directly against `backend.addressr.io/addresses?q=sydney` without the header returns 401; a probe via `addressr.p.rapidapi.com` with a valid RapidAPI consumer key returns 200.
6. UptimeRobot's existing monitor (via the Cloudflare Worker → RapidAPI → origin) continues to pass.
7. The two env vars are documented in `README.md` with examples for each deployment profile.
8. The env var values in AWS EB are not committed to this repository.

## Pros and Cons of the Options

### Option 1 — Opt-in env-var pair

- Good: Gateway-agnostic; no vendor lock-in.
- Good: Self-hosted default is no-enforcement — zero breaking change for existing npm/Docker users.
- Good: Cheap — one middleware, one startup check.
- Good: Fail-loud on partial config prevents silent bypass.
- Good: Reversible without a code change.
- Bad: Introduces shared-secret operational burden for the operator who enables it (rotation, storage).
- Bad: Does not provide per-caller accountability at the origin (acceptable — that's the gateway's job).

### Option 2 — Always-on bootstrap token

- Good: No misconfiguration path; every instance requires a secret.
- Good: Stronger default security posture for operators who weren't planning to configure anything.
- Bad: Breaks the zero-config self-hosted story — a local-dev or Docker-compose instance now needs a secret to accept any request.
- Bad: Violates ADR 013 and ADR 017's self-hosted distribution intent.
- Bad: Harder to downgrade or disable — no "just unset it" escape hatch.

### Option 3 — Network-level restriction (AWS SG / Cloudflare IP allowlist)

- Good: No application-layer change; simpler middleware.
- Good: Cannot be bypassed by spoofing an application-layer header.
- Bad: RapidAPI-specific (or any-single-vendor-specific); doesn't help operators fronting with other gateways.
- Bad: IP ranges of managed gateways drift; operators must maintain allowlists.
- Bad: AWS-specific implementation doesn't transfer to other hosts where Addressr might be deployed.
- Bad: Doesn't help `/api-docs` import flows that may originate from a different IP than the gateway's forwarding IPs.

### Option 4 — mTLS between gateway and origin

- Good: Strong cryptographic identity; cannot be bypassed by header spoofing.
- Good: Supports per-gateway identity if multiple gateways are deployed.
- Bad: RapidAPI does not offer client certificates on forwarded requests — incompatible with Mountain Pass's current topology.
- Bad: Complicates self-hosted setup; local dev needs cert generation even to run tests.
- Bad: Cert rotation adds operational cost beyond what shared-secret rotation requires.

### Option 5 — Signed-request / HMAC with timestamp

- Good: Replay-resistant; time-bound so leaked headers age out.
- Good: Per-request integrity (not just auth).
- Bad: Most commercial gateways only inject static headers; HMAC requires the gateway to sign per-request payloads, which RapidAPI, Kong, Tyk, Apigee do not natively do on provider-injected secrets.
- Bad: Significantly more complex middleware, clock-skew handling, replay cache.
- Bad: Rules out self-hosted-without-gateway use entirely unless clients themselves implement signing.

### Option 6 — Do nothing

- Good: Zero implementation cost.
- Good: No risk of misconfiguration-caused outages.
- Bad: P009 quantifies revenue leakage risk as Medium (Impact 3 × Likelihood 3). Accepting it indefinitely contradicts ADR 017's monetization intent.
- Bad: The P008 follow-up (publishing upstream URLs in OpenAPI `servers:`) will increase discoverability; "do nothing" is a compounding risk, not a stable baseline.

## Reassessment Criteria

Revisit this decision if any of the following occur:

- A paying consumer or operator requires per-caller accountability at the origin (would motivate per-caller tokens or mTLS; supersede with an ADR that introduces a richer auth model).
- Mountain Pass migrates off RapidAPI to a different monetization gateway (should be absorbed by the existing mechanism, but reconfirm the allowlist is still appropriate).
- The shared secret is ever leaked (requires rotation — confirm the mechanism supports zero-downtime rotation; if not, amend this ADR or add a rotation-focused follow-up).
- The `/api-docs` or `/health` allowlist is found to leak sensitive information (re-evaluate what should be exempt).
- A future Addressr version changes its HTTP surface substantially (new paths may need allowlisting or explicit enforcement).
- A gateway adopted by operators does not inject static headers (would necessitate option 5 HMAC or similar; supersede this ADR).

## Related

- [ADR 013](./013-docker-image.accepted.md) — Docker image distribution (self-hosted topology; must remain zero-config)
- [ADR 016](./016-uptime-robot-monitoring.accepted.md) — UptimeRobot monitoring (unaffected; monitor path goes through the Cloudflare Worker → RapidAPI → origin, and `/health` is allowlisted in any case)
- [ADR 017](./017-rapidapi-distribution.accepted.md) — RapidAPI distribution (the current fronted topology this ADR protects)
- [ADR 018](./018-cloudflare-worker-api-proxy.accepted.md) — Cloudflare Worker key proxy (unaffected; worker still calls `addressr.p.rapidapi.com`, not the upstream directly)
- [ADR 023](./023-openapi-spec-rapidapi-ci-sync.proposed.md) — OpenAPI spec RapidAPI CI sync (imposes constraint that `/api-docs` must remain unauthenticated; honoured by the allowlist)
- [Problem 008](../problems/008-rapidapi-gateway-rejecting-all-keys-for-listing.known-error.md) — outage that formally raised this follow-up
- [Problem 009](../problems/009-upstream-backends-openly-callable-bypassing-rapidapi.open.md) — the problem this ADR resolves
- [RISK-POLICY.md](../../RISK-POLICY.md) — Confidential Information section; secret values stay out of the repository
