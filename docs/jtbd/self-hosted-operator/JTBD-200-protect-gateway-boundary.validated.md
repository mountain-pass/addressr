---
status: validated
job-id: protect-gateway-boundary
persona: self-hosted-operator
date-created: 2026-04-15
screens:
  - all routes (proxy auth middleware)
---

# JTBD-200: Protect the chosen gateway boundary

## Job Statement

When I front Addressr with an API gateway (RapidAPI, Kong, Apigee, nginx, Caddy, my own Cloudflare Worker), I want the origin to reject any request that did not come through my gateway, so plan gating, rate limits, and billing cannot be circumvented by calling the upstream host directly.

When I self-host Addressr with no gateway in front, I want enforcement to stay off by default, so local development and existing npm/Docker deployments keep working with zero configuration.

When I misconfigure enforcement (set one half of the config pair and not the other), I want the process to fail loudly at startup, so I never silently ship an origin that accepts unauthenticated traffic.

## Desired Outcomes

- Default behaviour (no configuration) is unchanged from prior versions — zero breaking change for self-hosters
- Header name and expected value are both operator-configurable — no hard-coded gateway vendor
- `/health` and `/api-docs` remain reachable without the shared secret so monitors and gateway OpenAPI imports keep working
- Partial configuration fails at startup rather than allowing bypass

## Persona Constraints

- **Self-Hosted Operator** (primary): owns gateway choice, expects vendor-neutral integration.

## Current Solutions

- Hard-coded vendor-specific auth headers (e.g. `X-RapidAPI-Proxy-Secret`) — locks operator into one gateway.
- Layer-7 firewall rules at the IaC level — fragile, harder to audit, off by default.

## Related

- ADR 024 (Origin-gateway auth header enforcement) — the implementation of this job.
