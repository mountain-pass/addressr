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

**Option 1: Uptime Robot.** Monitors `https://cool-bush-ca66.addressr-key-provider.workers.dev/addresses/GANSW718804790` (a Cloudflare Workers endpoint that proxies to the API). Checks every 5 minutes.

Current metrics (as of 2026-03-31):
- Status: Up (11d 13h 15m)
- Last 7 days: 100%
- Last 30 days: 99.941% (4 incidents, 25m 24s down)
- MTBF: 350.25 hours
- Response time: ~307ms

### Consequences

- Good: External perspective catches infrastructure-level failures
- Good: Free tier covers single-monitor needs
- Good: 5-minute check interval provides reasonable detection time
- Neutral: Monitors a Cloudflare Workers proxy, not the EB endpoint directly
- Bad: No automated remediation (detection only, manual response)
- Bad: 5-minute interval means up to 5 minutes of undetected downtime

### Confirmation

- Uptime Robot dashboard shows active monitor for addressr
- README.md includes Uptime Robot badge

### Reassessment Criteria

- Need for faster detection (< 5 minutes)
- Need for automated incident response
- Adding monitors for additional endpoints (health check, search)
