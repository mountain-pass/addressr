---
status: proposed
job-id: validate-search-backend-before-cutover
persona: self-hosted-operator
date-created: 2026-04-29
screens:
  - src/read-shadow.js
  - service/address-service.js
  - src/waycharter-server.js
  - swagger.js
---

# JTBD-201: Validate a new search backend with realistic production traffic before cutover

## Job Statement

When migrating to a new search backend (e.g. OpenSearch 1.3.x → 2.x or 2.x → 3.x), I want to mirror real production query traffic to the candidate backend so its filesystem caches and field-data caches warm to steady state before I cut over, so the post-cutover p95 matches the pre-cutover p95 and consumers see no measurable latency change.

When the migration completes, I want the warming capability to remain in the codebase for the next migration, so I do not have to re-implement it under time pressure during a future upgrade.

When the warming capability is enabled in production, I want the consumer-facing primary path to be unaffected within a documented latency invariant, so JTBD-001's 200 ms latency budget and JTBD-003's geocode latency expectations stay intact.

## Desired Outcomes

- Default off — self-hosters and dev environments are unaffected
- One env var (`ADDRESSR_SHADOW_HOST`) gates the feature; partial credential configuration fails at startup
- Primary-path p95 increases by ≤ 1 ms when shadow is enabled vs disabled (verified by back-to-back k6 baselines)
- Shadow target failure (timeout, error, connection refused, 5xx) cannot impact the primary response or crash the addressr process
- A documented soak gate (≥ 48 hours of business traffic + p95 within 1.5× of v1 baseline) before cutover ships
- Capability persists in the codebase across migrations — no rebuild for Phase 2

## Persona Constraints

- **Self-Hosted Operator** (primary): owns OpenSearch cluster lifecycle, drives migration cadence, monitors cutover.
- **Web/App Developer** (constraint, not primary): JTBD-001/JTBD-003 latency budgets are inviolate even when shadow is on. Per `feedback_ask_before_ops_tradeoffs`, any consumer-path overhead requires explicit user approval (recorded in ADR 031 dated 2026-04-29).

## Current Solutions

- **k6 with synthetic queries** (`test/k6/script.js`) — uses random integers + 1–3 letter strings via `makeid`. Doesn't warm caches that real customers query. Insufficient for the migration warming need.
- **Force-merge before cutover** — consolidates Lucene segments. Doesn't address the actual bottleneck (page cache + field-data cache warmth, not segment count).
- **Bigger instances** — over-provisions to mask cold-cache latency. Higher AWS spend; doesn't validate root cause.
- **Skip warming, accept SLO breach** — violates ADR 029's zero-outage rollback claim.

## Related

- ADR 031 (Read-shadow for search-backend migrations) — the implementation of this job.
- ADR 029 (Two-phase blue/green OpenSearch upgrade) — drives the immediate need; cutover step 7 is gated on this job's soak criterion.
- JTBD-001 (Search and Autocomplete Addresses) — latency-budget constraint on the primary path.
- JTBD-003 (Geocode Addresses to Coordinates) — latency-budget constraint on the primary path.
- JTBD-400 (Ship Releases Reliably From Trunk) — release cadence into which read-shadow is shipped.
- P018 (no-cache parking note) — precedent for "ask before ops tradeoffs on the hot path".
