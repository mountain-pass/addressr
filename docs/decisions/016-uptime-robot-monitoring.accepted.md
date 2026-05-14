---
status: accepted
date: 2021-01-01
decision-makers: [Tom Howard]
consulted: []
informed: []
---

# ADR 016: Uptime Robot for External Availability Monitoring

## Context and Problem Statement

The production service needs external monitoring to detect outages that internal health checks might miss (e.g., DNS failures, load balancer issues, network partitions).

## Decision Drivers

- External monitoring independent of AWS infrastructure
- Fast detection (5 minute intervals)
- Free tier sufficient for basic monitoring
- Alerting on downtime

## Considered Options

1. **Uptime Robot** -- external HTTP monitoring with 5-minute checks
2. **AWS CloudWatch** -- internal AWS monitoring
3. **Pingdom** -- external monitoring (paid)
4. **Better Stack (formerly Better Uptime)** -- incident management + monitoring

## Decision Outcome

**Option 1: Uptime Robot.** Monitors a known-good address ID via the Cloudflare Worker route defined in ADR 018, at 5-minute intervals. The worker route is addressable via either `https://api.addressr.io/addresses/GANSW718804790` (custom domain) or `https://cool-bush-ca66.addressr-key-provider.workers.dev/addresses/GANSW718804790` (Cloudflare-assigned hostname). Both URLs route through the same worker — repointing between them does not change behaviour. P040 confirmed this directly in 2026-05-14 probes.

**Worker auth requirements for the probe**: the Cloudflare Worker authorises requests via either (a) a `Referer` or `Origin` header whose hostname is on the worker's `safeHosts` allowlist (e.g. `addressr.io`), or (b) a `CF-Connecting-IP` value matched against the worker's `safeIps` Uptime Robot IP allowlist. Until the worker's `safeIps` CIDR-match bug is fixed (P040 → P042), the monitor MUST send a custom HTTP header `Referer: https://addressr.io/` to traverse the safeHosts path reliably; IP-allowlist-based authorisation is intermittent because UR's published IP list has drifted past the worker's hardcoded list and the existing CIDR entries never match. Requires an Uptime Robot plan that supports custom HTTP request headers.

Snapshot metrics (as of 2026-03-31, prior to the P040 alert pattern):

- Status: Up (11d 13h 15m)
- Last 7 days: 100%
- Last 30 days: 99.941% (4 incidents, 25m 24s down)
- MTBF: 350.25 hours
- Response time: ~307ms

These figures are historical only; they do not reflect the 2026-05-14 alert pattern under the P040 RCA.

### Consequences

- Good: External perspective catches infrastructure-level failures
- Good: Free tier covers single-monitor needs
- Good: 5-minute check interval provides reasonable detection time
- Neutral: Monitors a Cloudflare Workers proxy, not the EB endpoint directly
- Bad: No automated remediation (detection only, manual response)
- Bad: 5-minute interval means up to 5 minutes of undetected downtime
- Bad: Until P042 lands (Terraform-managed worker), the monitor's traversal of the worker's auth boundary depends on a custom HTTP header configured in Uptime Robot's dashboard — operator-memory rather than a checkable artefact (per the JTBD-400 pattern this ADR's monitor is supposed to support).

### Confirmation

- Uptime Robot dashboard shows an active monitor for addressr, targeting the worker route URL.
- The monitor configuration carries a custom HTTP header `Referer: https://addressr.io/` (P040 workaround until the worker patch lands).
- README.md includes the Uptime Robot badge.
- Manual probe: `curl -sf -H 'Referer: https://addressr.io/' https://api.addressr.io/addresses/GANSW718804790` returns 200 with the HATEOAS address record (smoke-tested on every release via the worker-vs-origin probes in `release.yml`).

### Reassessment Criteria

- Need for faster detection (< 5 minutes)
- Need for automated incident response
- Adding monitors for additional endpoints (health check, search)
- **P042 landed (Cloudflare Worker version-controlled via Terraform with CIDR-aware `safeIps` matching).** Revisit whether the Referer-header requirement in Decision Outcome is still needed, or whether IP-allowlist-based authorisation is reliable enough on its own.
- **Considering a second monitor targeting `backend.addressr.io` directly** to cover ADR 024 origin enforcement separately from worker enforcement. If adopted, this would supersede this ADR with a dual-target monitoring decision rather than amend it.

## Related

- ADR 018 (Cloudflare Worker as API Key Proxy) — the worker route this monitor traverses and the source of the `safeHosts` / `safeIps` allowlist semantics this ADR's Confirmation depends on.
- ADR 024 (Origin Gateway Auth Header Enforcement) — distinct enforcement layer at `backend.addressr.io`; not in the worker-route monitor path.
- P040 (Uptime Robot 401 alerts — Cloudflare Worker allowlist CIDR-match bug + UR IP drift) — the realised consequence that drove this amendment.
- P042 (Terraform-managed Cloudflare Worker) — closes ADR 018 line 50/63 and unblocks removing the Referer-header requirement from this ADR's Confirmation.
