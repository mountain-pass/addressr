---
status: 'proposed'
date: 2026-07-13
human-oversight: confirmed
oversight-date: 2026-07-13
decision-makers: [Tom Howard]
consulted: []
informed: []
reassessment-date: 2026-10-13
---

# ADR 035: Upgrade to OpenSearch 3.5; retain 2.19 as CI regression + code compatibility, not a running domain

> Captured via /wr-architect:capture-adr (foreground-lightweight aside-invocation per ADR-032 P156 amendment). Run /wr-architect:create-adr on this ID to expand the deferred sections canonically. **Amends [ADR 029](029-opensearch-blue-green-two-phase-upgrade.accepted.md).**

## Context and Problem Statement

[ADR 029](029-opensearch-blue-green-two-phase-upgrade.accepted.md) is a **two-phase** blue/green upgrade off OpenSearch 1.3.x: Phase 1 (1.3.20 → 2.19) completed 2026-07-11 — production serves from the v2 domain `addressr4` (OpenSearch 2.19, `m6g.large.search` × 2, IAM/SigV4, FGAC off) and v1 `addressr3` was decommissioned. ADR 029 defers **Phase 2 (2.19 → latest 3.x)** to a separate implementation story, committing only to the pattern. This ADR activates Phase 2.

Two facts (verified 2026-07-13): AWS OpenSearch Service's latest is **OpenSearch 3.5** (GA March 2026); and **2.19 → 3.x is AWS's supported upgrade path** — a domain must be on 2.19 before 3.x, which is exactly where the two-phase design lands us. So Phase 2 is now feasible on the current backend.

The open question this ADR resolves is **not** whether/how to upgrade (ADR 029 already decided the blue/green + reindex-from-G-NAF pattern) but what the user's directive **"maintain support for v2 until it's EOLed"** means operationally — a deliberate departure from Phase 1, where v1 was decommissioned in ~1 day with the soak waived and rollback downgraded to rebuild-from-G-NAF.

## Decision Drivers

- Execute the ADR 029 Phase 2 upgrade landing on AWS's latest supported 3.x (3.5), reusing the proven Phase 1 machinery rather than bespoke tooling
- Keep the per-hop behavioural regression surface bounded and gated identically to Phase 1 (SSLA + Cucumber + k6 before cutover)
- "Maintain support for v2 (the 2.19 domain generation) until EOL" — **without** paying for a second running production domain for the multi-year window until AWS EOLs 2.19 (unannounced; likely 2027+, ≈ ~$200/mo × 18–36 mo ≈ $3.6k–7.2k for a running v2)
- (further drivers deferred to /wr-architect:create-adr canonical review)

## Considered Options

Naming note: "v1/v2/v3" are **domain generations** (`addressr3`/`addressr4`/`addressr5`), not API versions and not engine majors. "v2" = the `addressr4` / OpenSearch-2.19 domain.

1. **Option C + standing 2.19 CI-regression leg (chosen)** — v3 (`addressr5`, OpenSearch 3.5) blue/green + reindex-from-G-NAF becomes primary serving; after cutover + soak the `addressr4` (2.19) **prod domain is decommissioned** (rollback = rebuild-from-G-NAF, the same trade accepted for v1 at ADR 029 step 9 2026-07-11). "Maintain support for v2" is realised as **code compatibility + CI regression**: the `release.yml` build-and-test matrix keeps a local `opensearch:2.19.x` leg (small OT-scale dataset) alongside `3.5.x`, and the app/loader/client stay multi-version-capable against 2.19, **until AWS reaches 2.19 EOL** — at which point 2.19 drops from the matrix exactly as 1.3.20 was in Phase 1. ~$0 ongoing infra cost.
2. **Option A (rejected)** — v3 primary; keep the v2 domain **running but stale** (crons write v3 only) as an instant-flip rollback. Same ~$3.6k–7.2k cost as B without the freshness; over an 18–36-month window the rollback target degrades to serving badly-outdated addresses ("warm" becomes false comfort).
3. **Option B (rejected)** — v3 primary; **dual-write** the 9 crons + populate to both v2 and v3 so v2 stays fresh as an instant-flip rollback until 2.19 EOL. Best rollback semantics, but ~$3.6k–7.2k **plus** permanent loader/alarm/dashboard complexity (two-host resolve/upload, dual OIDC scoping, per-version alarms). ADR 029 already rejected a dual-write bridge for the bulk load (sub-option 5c); the quarterly-delta case is lineage-relevant, not disqualifying — but the cost/complexity is not warranted for a rollback target.
4. **Time-boxed A→C (rejected)** — keep v2 fresh through one post-cutover soak cycle, then decommission. Cost-rational middle; rejected because the user's intent is code/CI support, not a temporary running fallback.

## Decision Outcome

Chosen option: **Option C + a standing 2.19 CI-regression leg**, because it honours "maintain support for v2 until EOL" as **compatibility + regression coverage** (the durable, useful reading) rather than a running rollback domain, and avoids the ~$3.6k–7.2k multi-year cost of parallel production infrastructure while keeping the rollback trade the user already accepted for v1 (rebuild-from-G-NAF).

**Amends [ADR 029](029-opensearch-blue-green-two-phase-upgrade.accepted.md):** its Phase-1 Confirmation/Consequences framed the parallel-domain cost double-up as _temporary during soak_ and decommission-after-soak as the disposition. This ADR keeps that disposition for the **running domain** (v2 torn down after v3 cutover + soak) but adds a **new steady-state property**: 2.19 remains a first-class **CI-matrix regression target** and a supported **code-compatibility** target until AWS EOLs 2.19. ADR 029's core outcome (two-phase blue/green, 2.19-first, reindex-from-G-NAF, zero-outage) is unchanged.

**Execution (reuses Phase 1 machinery; each prod-affecting step gated):**

1. **Multi-version CI first (no prod spend):** `package.json` `SEARCH_IMAGE` default → 3.5.x, keep `SEARCH_IMAGE_2_19`, add `SEARCH_IMAGE_3_5`; `release.yml` build-and-test matrix `['2.19.5', '3.5.x']`; verify the app + client (`@opensearch-project/opensearch@^3.5.1`) pass `test:nogeo` + `test:geo` on both. This is the fail-fast compatibility gate before any AWS spend (mirrors ADR 029 Phase 1 step 1).
2. **Provision v3** `addressr5` (OpenSearch_3.5) via the `deploy/modules/opensearch` module (parallel to v2); new `gha-v3-loader` OIDC role (least-privilege `es:ESHttpGet/Put/Post/Head` on the v3 ARN, master-ref `sub`), `TF_VAR_ELASTIC_V3_HOST`, a v3 `SearchableDocuments`-drop alarm, and the parity dashboard extended to v2-vs-v3.
3. **Populate v3** from G-NAF (reindex, sub-option 5a) via `populate-search-domain.yml` (`target` enum gains `v3`); **canary** a single small state (OT) through the caller chain first (the ADR 034 caller-chain lesson).
4. **Verify on the AWS-managed 3.5 domain:** SSLA 14/14, Cucumber `test:nogeo` + `test:geo`, then k6 (ADR 031) — the formal cutover gate.
5. **Cutover** EB `ELASTIC_HOST` → `module.opensearch_v3.endpoint` (same atomic host+auth-mode flip shape as ADR 029 Stage 5); `/health` auto-rollback stays the safety net.
6. **Soak, then decommission v2** `addressr4`; flip the crons to `target=v3`; keep the 2.19 CI leg + code compatibility.

**Regression watch-items (addressr-specific, 2.19 → 3.5):** P027 synonym / `match_bool_prefix` / `fuzziness: AUTO:5,8` interaction; the `my_analyzer` custom analyzer (pattern tokenizer + synonym filter); the ADR 026 `phrase_prefix` best_fields + `sla_range_expanded` tie_breaker=0.0 asymmetry; the `replicas:0`-load-then-add-replica technique; client pin. Mappings are already typeless (no `_type` break). Reindex-from-G-NAF sidesteps the Lucene-10 forced-reindex; Java 21 / Security Manager removal are AWS-managed-domain internals, out of our scope.

## Consequences

### Good

- (deferred to /wr-architect:create-adr canonical review)

### Neutral

- (deferred to /wr-architect:create-adr canonical review)

### Bad

- Rollback after v2 decommission is rebuild-from-G-NAF (hours), not instant-flip — accepted, consistent with the ADR 029 step-9 2026-07-11 v1 trade. Mitigated by the pre-cutover gate + `/health` auto-rollback during the deploy window.

## Confirmation

(deferred to /wr-architect:create-adr canonical review — testable criteria: CI matrix green on both 2.19.5 and 3.5.x; SSLA 14/14 + Cucumber + k6 on the AWS-managed 3.5 domain pre-cutover; v3 drop-alarm armed; v2 decommissioned post-soak; 2.19 leg retained in the matrix.)

## Pros and Cons of the Options

### Option C + 2.19 CI-regression leg

- Good: no multi-year parallel-domain cost; keeps genuine 2.19 regression coverage + code compatibility; reuses proven machinery
- (further pros/cons + Options A/B/time-boxed deferred to /wr-architect:create-adr canonical review)

## Reassessment Criteria

(deferred to /wr-architect:create-adr canonical review — key trigger: AWS announces 2.19 EOL → drop the 2.19 CI leg. Default reassessment-date 3 months from capture.)
