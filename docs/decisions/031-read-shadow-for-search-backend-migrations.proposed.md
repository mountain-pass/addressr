---
status: 'proposed'
date: 2026-04-29
decision-makers: [Tom Howard]
consulted: []
informed: []
---

# ADR 031: Read-Shadow for Search-Backend Migrations

## Context and Problem Statement

ADR 029 Phase 1 step 6 (validate-v2 smoke probes against the parallel
`search-addressr4-…` OpenSearch domain) passed: cluster GREEN, 16,841,097
documents (exact match with v1), search probe `q=sydney` returns 10,000 hits.
But a baseline-vs-target k6 perf comparison (38-min ramped 5→20 VUs) shows v2
search p95 at **8,951 ms vs v1's 741 ms** (~12× slower) with individual queries
hitting 60-second timeouts. Investigation rules out CPU contention (hot threads
idle), segment fragmentation (102 v2 vs 109 v1 segments), shard imbalance
(GREEN, all primaries + replicas assigned), and snapshot pressure (no active
snapshot during the failing k6 run).

The cause is empty filesystem cache and field-data cache on a v2 cluster that
has never served a real query. v1's "fast" responses reflect months of warmed
state from production traffic. k6 alone uses synthetic random-integer + 1–3
letter queries (`makeid` in `test/k6/script.js`) that don't exercise the
production query distribution, so it doesn't warm the cache entries that real
customer queries hit. Cutover today would push 5–10× search latency to
RapidAPI consumers — measurable customer-experience degradation that violates
ADR 029's "zero-outage rollback" guarantee.

A decision is needed before ADR 029 step 7 (cutover) can ship.

## Decision Drivers

- **Must warm v2 with realistic production query distribution** so the post-
  cutover steady state matches v1's. k6's synthetic queries do not satisfy
  this.
- **Must not perturb the consumer-facing primary path during the warming
  window.** JTBD-001 ("Search and Autocomplete Addresses") has a documented
  200 ms latency budget. Any warming mechanism that adds measurable latency to
  the primary `/addresses?q=...` response is in conflict with that job.
- **Must default off** so self-hosted operators (`@mountainpass/addressr` npm,
  Docker) are unaffected — same posture as ADR 024.
- **Must be gateway-agnostic and cluster-agnostic** so the same capability
  serves the future Phase 2 (OpenSearch 2.x → 3.x) migration, not just this
  one cutover.
- **Must fail loudly on partial configuration** to prevent silent enable-
  without-target.
- **Soak time must be enforceable, not implied.** Without an explicit soak
  duration before cutover, "zero-outage" becomes aspirational.
- **Implementation must be cheap and isolated.** A small clean-ESM helper
  module + a single mirror call in the search hot path, plus startup
  validation in both server entries.

## Considered Options

1. **Read-shadow with fire-and-forget mirroring of `/addresses?q=...` and
   `/addresses/{id}` to a configurable secondary OpenSearch backend.** Default
   off; one env-var (`ADDRESSR_SHADOW_HOST`) gates the feature.
2. **Recorded-query corpus replayed against v2.** Capture a sample of real
   v1 queries to a log, replay against v2 from a separate process. No primary-
   path code change.
3. **Skip warming entirely.** Cut over and accept the SLO breach during the
   first hours of v2 traffic. Rely on `git revert`-style rollback if breach is
   prolonged.
4. **Force-merge v2 indices.** Consolidate Lucene segments to fewer/larger
   files. Cheaper than read-shadow but doesn't address page-cache warmth (the
   actual bottleneck per investigation findings).
5. **Bigger v2 instances.** Bump from 2× t3.small.search to a larger class
   (e.g. m5.large.search). Higher AWS spend, but addresses underlying capacity
   if cold-cache latency proves not to be the only issue.
6. **Index-time dual-write only.** Loader writes both v1 and v2 during
   quarterly G-NAF refreshes. Doesn't address the read-cache warming need
   either; data is already in sync as of today's populate.

## Decision Outcome

Chosen option: **"Option 1 — Read-shadow with fire-and-forget mirroring."**

- Closes the cold-cache gap with realistic query distribution (the only
  warming strategy that hits the cache entries customers actually query).
- Default-off preserves self-hosted zero-config behaviour (same posture as
  ADR 024).
- Reusable for ADR 029 Phase 2 (2.x → 3.x), so the capability earns its
  keep beyond this cutover. Lifetime is ≥ one additional migration.
- Quantified primary-path overhead (see Quantification below) is well under
  JTBD-001's latency budget.
- Fail-loud startup validation prevents silent half-enable.
- An explicit soak gate before cutover (see Soak Gate below) makes ADR 029's
  "zero-outage" claim measurable rather than rhetorical.

User explicitly approved the consumer-path overhead on **2026-04-29** per the
`feedback_ask_before_ops_tradeoffs` memory and per JTBD-001's "ask before ops
tradeoffs on the hot path" precedent (P018).

Options 2–6 are kept in scope but rejected for this cutover (see "Pros and
Cons of the Options" below). Option 4 (force-merge) and Option 5 (bigger
instances) remain available as escalation paths if read-shadow soak fails to
close the perf gap.

### Configuration

| Env var                      | Default | Purpose                                           |
| ---------------------------- | ------- | ------------------------------------------------- |
| `ADDRESSR_SHADOW_HOST`       | unset   | Hostname of the shadow OpenSearch cluster (gate)  |
| `ADDRESSR_SHADOW_PORT`       | 443     | Port (default matches HTTPS)                      |
| `ADDRESSR_SHADOW_PROTOCOL`   | https   | Protocol (`http` for local dev, `https` for prod) |
| `ADDRESSR_SHADOW_USERNAME`   | unset   | Optional basic-auth username                      |
| `ADDRESSR_SHADOW_PASSWORD`   | unset   | Optional basic-auth password                      |
| `ADDRESSR_SHADOW_TIMEOUT_MS` | 3000    | AbortController timeout per shadow request        |

`ADDRESSR_SHADOW_HOST` unset = feature disabled (no-op). When set, the
USERNAME/PASSWORD pair must both be set or both be unset (mirrors ADR 024's
fail-loud-on-partial pattern).

### Behaviour

- **`ADDRESSR_SHADOW_HOST` unset** → mirror call is a no-op; primary path
  unchanged. Self-hosted default.
- **`ADDRESSR_SHADOW_HOST` set, USERNAME/PASSWORD pair valid** → after each
  primary `globalThis.esClient.search(...)` and `.get(...)` returns, the same
  request body is sent to the shadow client. The shadow promise is detached
  (`.catch(swallowError)`) so its outcome cannot affect the primary response.
- **USERNAME set without PASSWORD (or vice-versa)** → process fails at startup
  with a clear error naming both vars and the missing one.
- **Shadow request error / timeout / connection refused / 5xx** → swallowed
  via `debug('error')` log; primary response is unaffected. No unhandled
  promise rejection.
- **Shadow response contents** → discarded. Read-shadow does not compare v1
  vs v2 results; this is a warming mechanism, not a correctness check.

### Quantification (per ADR 023 runtime-path discipline)

Worst-case per-request overhead on the primary thread (synchronous portion of
the fire-and-forget call):

| Step                                                                                                                                     | Cost                  |
| ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `JSON.stringify` of ~1–2 KB query body                                                                                                   | ~0.05–0.2 ms          |
| `@opensearch-project/opensearch` client `.search()` sync portion (param validation, header build, request enqueue, socket write attempt) | ~0.3–0.8 ms           |
| `AbortController` construct + `setTimeout(3000)` schedule + `.catch` attach                                                              | ~0.02 ms              |
| **Net synchronous primary-thread delta**                                                                                                 | **~0.5–1.0 ms / req** |

Steady-state memory at N RPS (timer + socket + promise overhead):

| RPS | Outstanding timers | Outstanding sockets | Approx CPU on primary |
| --- | ------------------ | ------------------- | --------------------- |
| 1   | ~3                 | ~3                  | < 0.1% of one core    |
| 10  | ~30                | ~30                 | ~1% of one core       |
| 100 | ~300               | ~300                | ~10% of one core      |

Outbound bandwidth: ~1–2 KB query body per request × 2× (primary + shadow).
At 100 RPS, ~200 KB/s outbound to v2 shadow target. Intra-region traffic
(both v1 and v2 are in `ap-southeast-2`); no cross-AZ data charges if the
EB instance and v2 domain are in the same AZ.

**Request-frequency assumption**: no telemetry was attached to the source
data; the figures above use a worst-case 100 RPS sustained. Actual addressr
production RPS is expected to be 1–10 RPS based on RapidAPI typical mid-tier
API load (no data — worst-case assumption per ADR 023).

**Aggregate-load assessment**: at 100 RPS worst case, ~10% of one EB CPU core
is consumed by mirror overhead. EB instance class is `t3.small` (2 vCPU);
worst-case is ~5% of the EB instance. Acceptable. At realistic 1–10 RPS,
overhead is ≤ 1% — well within noise.

### Primary-path invariant

**With shadow enabled, /addresses and /addresses/{id} p95 must not increase
by more than 1 ms vs shadow disabled.** Verified by:

- A baseline k6 run with shadow OFF (already captured: search p95=741 ms,
  retrieve p95=36 ms — see `target/stress-v1.csv` 2026-04-29).
- A confirmation k6 run with shadow ON pointing at v2 (executed pre-cutover
  to verify the invariant).

If the post-shadow-on k6 run shows primary p95 increase > 1 ms, read-shadow
is gated off until the cause is investigated and remediated.

### Soak Gate

Cutover (ADR 029 step 7) proceeds **only after both** of these are true:

1. **Read-shadow has been enabled in production for ≥ 48 hours** of business
   traffic against the v2 cluster.
2. **A baseline-vs-target k6 run shows v2 p95 ≤ 1.5× v1 p95** (i.e., v2
   search p95 ≤ ~1,100 ms given v1's 741 ms baseline). Configurable per
   migration; the 1.5× multiplier reflects "comparable but with some headroom
   for transient v2-side variance."

If the soak gate is not met after 48 hours, extend the soak window (up to
1 week). If still not met after 1 week, escalate to Option 4 (force-merge)
or Option 5 (bigger instances) before any cutover.

### Where the code lives

| File                                                                                               | Role                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/read-shadow.js` (new)                                                                         | Clean-ESM helper. `validateReadShadowConfig`, `getShadowClient` (lazy singleton), `mirrorRequest` (fire-and-forget). Unit-testable per P033.                                            |
| `service/address-service.js` (modified)                                                            | Mirror call after `searchForAddress` and `getAddress` primary `client.*()` returns. Annotated `// @jtbd JTBD-201`.                                                                      |
| `src/waycharter-server.js` (modified, line ~555)                                                   | `validateReadShadowConfig()` call alongside existing `validateProxyAuthConfig()`.                                                                                                       |
| `swagger.js` (modified)                                                                            | `validateReadShadowConfig()` call at startup. New pattern (no proxy-auth precedent on the legacy v1 server).                                                                            |
| `test/js/__tests__/read-shadow.test.mjs` (new)                                                     | `node:test` unit tests with DI mocks per P033. ~12 cases covering pair-validation, no-op, fire-and-forget semantics, error swallowing, timeout abort, and synchronous-throw protection. |
| `docs/jtbd/self-hosted-operator/JTBD-201-validate-search-backend-before-cutover.proposed.md` (new) | Documents the operator job this capability serves. Persona constraints make consumer-path latency invariants explicit.                                                                  |

## Consequences

### Good

- Closes the cold-cache perf gap with the only warming strategy that hits real
  customer query patterns.
- Default-off preserves self-hosted zero-config behaviour (ADR 024 parity).
- Same capability serves Phase 2 (2.x → 3.x) without rebuild.
- Soak gate makes ADR 029's "zero-outage" claim measurable.
- Implementation is small and contained: one helper module, one mirror call
  per primary client method, two startup validators.
- Failure modes are well-bounded (AbortController timeout + try/catch wrap +
  `.catch(swallowError)`); shadow target outage cannot impact primary path.

### Neutral

- Adds a small set of env vars that self-hosters must explicitly _not_ set.
  Same shape as ADR 024's documentation note.
- Lifetime: feature stays in the codebase indefinitely (next migration uses
  it). Not a one-shot.
- Doubles outbound search bandwidth from EB during shadow-on windows. ~200 KB/s
  worst case. Trivial relative to EB's network budget.

### Bad

- Adds ~0.5–1.0 ms to primary `/addresses` p95 when shadow is on. User
  approved this overhead on 2026-04-29; tracked under JTBD-001's hot-path
  invariant.
- Process gains one more failure mode: misconfigured USERNAME/PASSWORD pair
  fails startup. Same shape as ADR 024's mitigation — fail-loud is preferred
  to silent half-enable.
- Operator must remember to disable shadow after cutover stabilises (or
  explicitly choose to keep it on as a rollback warmer). Documented in the
  cutover runbook.

## Pros and Cons of the Options

### Option 1 — Read-shadow with fire-and-forget mirroring (chosen)

- ✅ Warms with real query distribution (the only mechanism that does)
- ✅ Default-off, self-hosted-safe
- ✅ Reusable for Phase 2
- ✅ Soak gate makes outcome measurable
- ❌ Adds runtime code to consumer hot path (mitigated by quantified delta + invariant + user approval)
- ❌ Operator must remember to disable post-cutover (or explicitly keep)

### Option 2 — Recorded-query corpus replay

- ✅ No primary-path code change
- ❌ Requires a query-capture pipeline (separate engineering effort, larger surface)
- ❌ Replay timing skews from real traffic — caches warm out of order
- ❌ Storing real customer queries raises privacy questions not present in fire-and-forget

### Option 3 — Skip warming, accept SLO breach

- ✅ Zero engineering effort
- ❌ Customer-experience degradation for the first hours of v2 traffic (contradicts ADR 029 zero-outage goal)
- ❌ Harder to argue "zero-outage rollback" if cutover triggers an SLO breach that takes hours to resolve

### Option 4 — Force-merge v2 indices

- ✅ Cheaper than read-shadow
- ❌ Doesn't warm page caches or field-data caches (the actual bottleneck per investigation findings — segment counts already match)
- ❌ Operationally heavy on t3.small.search (15–45 min per shard)
- Kept as escalation path if read-shadow soak fails

### Option 5 — Bigger v2 instances

- ✅ Addresses underlying capacity if the perf gap isn't purely cache-related
- ❌ Higher AWS spend ($45–90/mo additional for m5.large.search × 2)
- ❌ Doesn't validate the gap was capacity-bound; just over-provisions
- Kept as escalation path if read-shadow soak fails

### Option 6 — Index-time dual-write

- ✅ Keeps v2 in sync with v1 across quarterly refreshes
- ❌ Doesn't address read-cache warming (the actual bottleneck)
- ❌ Index data is already in sync as of today's populate; no quarterly refresh due in the cutover window
- Out of scope for this cutover; revisit before Phase 2

## Confirmation

> **Amendment 2026-05-14** — capability is in **default-off posture**. ADR 029 Phase 1 was rolled back; `ADDRESSR_SHADOW_*` env vars removed from the EB resource in `deploy/main.tf`; `src/read-shadow.js`'s `mirrorRequest` no-ops when `ADDRESSR_SHADOW_HOST` is unset. The capability remains shipped and tested in code (no change to `src/`, no change to `test/`); a future search-backend migration re-enables it by reintroducing the env-var block. No status change to this ADR.

This ADR's outcome is satisfied when:

- `src/read-shadow.js` ships with `validateReadShadowConfig` and `mirrorRequest`
  exports as specified.
- `test/js/__tests__/read-shadow.test.mjs` ships with ~12 unit tests covering
  pair-validation (3 cases), no-op when disabled (1), fire-and-forget semantics
  (3), error swallowing (2), synchronous-throw protection (1), timeout abort
  (1), unknown-method rejection (1). All run via `npm run test:js` and via
  the pre-commit hook.
- `service/address-service.js` calls `mirrorRequest` after the `searchForAddress`
  and `getAddress` primary client calls, without await.
- Both `src/waycharter-server.js` and `swagger.js` call
  `validateReadShadowConfig()` at startup.
- Cucumber suite (`npm run test:nodejs:nogeo`) passes with shadow OFF
  (default).
- A documented manual local two-OpenSearch probe demonstrates shadow requests
  hit the secondary backend (visible in `_nodes/stats/indices/search.query_total`
  on the shadow target).
- Pre-cutover k6 baseline-vs-target run with shadow ON for ≥ 48 hours shows
  v2 p95 ≤ 1.5× v1 p95.
- Primary-path invariant (≤ 1 ms p95 delta with shadow on vs off) is verified
  via a back-to-back k6 pair against v1 with shadow off vs on.
- **Soak-validity check (added 2026-04-29 after P028)**: before declaring the
  soak window valid, verify that shadow requests are returning **2xx** on the
  shadow target — not just that mirror invocations are being attempted.
  The original soak gate gated on shadow invocation count (`mirrorRequest`
  reaching the shadow client) but not on shadow HTTP status; P028 produced a
  pathological 100%-401 case where invocations occurred and primary responses
  were unaffected (all swallowed via `swallowError`) yet zero cache warming
  happened. Concrete check: `aws elasticbeanstalk describe-configuration-settings`
  for `ADDRESSR_SHADOW_*`, then `curl -u USER:PASS https://${ADDRESSR_SHADOW_HOST}/addressr/_count`
  must return 200. If 401, soak window is invalid; restart after fixing creds.

## Reassessment Criteria

Reassess this ADR when any of:

- The next major search-engine migration completes (Phase 2 OpenSearch 2.x →
  3.x): if read-shadow proves valuable a second time, promote to `accepted`
  permanently. If it proves unnecessary (e.g. v2 → v3 doesn't have a cold-
  cache problem because shapes are similar), consider removing the code.
- Production primary-path p95 with shadow off vs on diverges by > 1 ms in
  any 24-hour window — the primary-path invariant is violated; investigate
  before re-enabling.
- A query-replay tooling becomes available that obviates the live mirror
  approach (Option 2 becomes cheaper than read-shadow's maintenance cost).

## Related

- **Drives**: ADR 029 step 6b (new) — soak window before step 7 cutover.
- **Pattern precedent**: ADR 024 (`ADDRESSR_PROXY_AUTH_*` env-var contract,
  `validate*Config()` startup pattern, fail-loud-on-partial).
- **Quantification discipline**: ADR 023 (runtime-path performance review).
- **Anti-pattern compliance**: P033 (source-inspection tests anti-pattern;
  read-shadow lives in clean-ESM `src/`).
- **JTBD coverage**: JTBD-201 (new — operator job for backend validation
  before cutover); JTBD-001/003 (consumer latency-budget invariants).
- **Memory**: `feedback_ask_before_ops_tradeoffs` (P018-class precedent;
  user explicitly approved 2026-04-29).
