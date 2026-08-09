---
status: proposed
human-oversight: confirmed
oversight-date: 2026-07-06
job-id: validate-search-backend-before-cutover
persona: self-hosted-operator
date-created: 2026-04-29
screens:
  - src/read-shadow.js
  - service/address-service.js
  - src/waycharter-server.js
  - src/proxy-auth.js
  - /debug/shadow-config
  - src/init-index-config.js
  - client/elasticsearch.js
---

# JTBD-201: Validate a new search backend with realistic production traffic before cutover

## Job Statement

When migrating to a new search backend (e.g. OpenSearch 1.3.x → 2.x or 2.x → 3.x), I want to mirror real production query traffic to the candidate backend so its filesystem caches and field-data caches warm to steady state before I cut over, so the post-cutover p95 matches the pre-cutover p95 and consumers see no measurable latency change.

When the migration completes, I want the warming capability to remain in the codebase for the next migration, so I do not have to re-implement it under time pressure during a future upgrade.

When the warming capability is enabled in production, I want the consumer-facing primary path to be unaffected within a documented latency invariant, so JTBD-001's 200 ms latency budget and JTBD-003's geocode latency expectations stay intact.

## Desired Outcomes

- Default off — self-hosters and dev environments are unaffected
- One env var (`ADDRESSR_SHADOW_HOST`) gates the feature; partial credential configuration fails at startup
- Primary-path p95 increases by ≤ 1 ms when shadow is enabled vs disabled (verified 2026-07-31 by a controlled shadow-off/shadow-on A/B plus a signing microbenchmark; the k6 pair was retired as unfit at ~50× insufficient resolution)
- Shadow target failure (timeout, error, connection refused, 5xx) cannot impact the primary response or crash the addressr process
- A documented soak gate (coverage, parity, warmth convergence, a ≥ 24 h floor spanning a business-hours peak, and p95 within 1.5× of a freshly re-derived baseline) before cutover ships
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

- ADR 031 (Read-shadow for search-backend migrations) — the implementation of this job. **Scope correction 2026-08-09**: ADR 031's Confirmation criterion claimed `mirrorRequest` is called after both the `searchForAddress` AND `getAddress` primary client calls. It is called once, inside `searchForAddress`; `getAddress` has never mirrored. So the RETRIEVE path (`/addresses/{id}`) does not warm, and this job's statement above — "the post-cutover p95 matches the pre-cutover p95 and consumers see no measurable latency change" — is delivered for the search path only. Recorded as an accepted gap rather than silently scoped: the soak gate's coverage criterion is silent about a path this job names, and JTBD-003, bound below as an inviolate latency budget, screens only that unwarmed path.
- ADR 029 (Two-phase blue/green OpenSearch upgrade) — drives the immediate need; cutover step 7 is gated on this job's soak criterion.
- JTBD-001 (Search and Autocomplete Addresses) — latency-budget constraint on the primary path.
- JTBD-003 (Geocode Addresses to Coordinates) — latency-budget constraint on the primary path.
- JTBD-400 (Ship Releases Reliably From Trunk) — release cadence into which read-shadow is shipped.
- P018 (no-cache parking note) — precedent for "ask before ops tradeoffs on the hot path".
