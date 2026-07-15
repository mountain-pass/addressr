# Problem 038: Scale v2 OpenSearch back to steady-state sizing (`t3.small.search` × 2, 10 GB EBS) post-populate

**Status**: Parked
**Reported**: 2026-05-13
**Parked**: 2026-05-14
**Priority**: 6 (Medium) — Impact: Moderate (3) x Likelihood: Likely (2) (deferred — re-rate at next /wr-itil:review-problems)
**Effort**: S (deferred — re-rate at next /wr-itil:review-problems)

## Parked

**Reason**: Superseded by ADR 029 Phase 1 rollback 2026-05-14 — the m6g.large.search v2 cluster this scale-back targeted is being decommissioned. The scale-back action no longer has anything to act on. The architectural learning (populate-window sizing is workload-asymmetric vs steady-state; provision at target class from the start, not via resize blue/green) is captured in ADR 029's Phase 1 rollback amendment 2026-05-14.

**Un-park trigger**: ADR 029 Phase 1 re-attempt fires AND the operator provisions at a populate-friendly instance class that needs scale-back post-populate. If the re-attempt provisions directly at v1-matching class (`t3.small.search`) and proves it can handle from-scratch populate, this ticket is permanently superseded.

## Description

ADR 029 step 5 amendment 2026-05-13 temporarily scaled `search-addressr4` (v2) up from `t3.small.search` × 2 + 10 GB EBS to `m6g.large.search` × 2 + 20 GB EBS to clear bulk-index + shadow contention during the from-scratch populate. The scale-up is operationally necessary for populate to complete cleanly (populate run 25731879773 hit `snapshot_in_progress_exception` on QLD + WA per I001; run 25762661760 hung 2h+ with shadow success rate dropping from 95% → 52% on t3.small).

Steady-state v2 workload post-cutover is identical to v1's today (query-only, ~0.5 q/s, quarterly G-NAF delta refreshes), which v1 handles on `t3.small.search` × 2 + 12 GB EBS comfortably (56% disk utilisation). Once v2 has all 9 states loaded and the soak window is closed, v2 should scale back to the v1-matching class to avoid carrying ~$200/month of incremental cost (m6g.large.search × 2 ≈ $268/month vs t3.small.search × 2 ≈ $67/month per ap-southeast-2 on-demand).

## Symptoms

(populate-window stress is not steady-state behaviour — the symptom this ticket addresses is the _cost line item_ if scale-back is forgotten)

## Workaround

(none needed pre-scale-back; m6g.large is over-provisioned for steady-state, not broken — just expensive)

## Impact Assessment

- **Who is affected**: Project budget / ADR 021 (managed OpenSearch is already the largest single AWS bill item).
- **Frequency**: continuous from populate-complete until manual scale-back.
- **Severity**: ~$200/month incremental cost if scale-back is forgotten. Not user-visible.
- **Analytics**: AWS Cost Explorer; ADR 029 Consequences "AWS cost double-up" line.

## Root Cause Analysis

The architectural decision recorded in ADR 029 step 5 amendment 2026-05-13 explicitly decouples populate-window sizing from steady-state sizing. Operator memory cannot be relied on for the scale-back (per the P035-class learning that operator-memory steps are unreliable for cutover-window operations). This ticket is the durable record of the deferred-action.

### Investigation Tasks

- [ ] Re-rate Priority and Effort at next /wr-itil:review-problems
- [ ] **Close-trigger**: v2 populate completes (9/9 states loaded; addressr count matches v1's ~16.8M; shadow `/debug/shadow-config` 2xx-rate clean for ≥1h post-populate)
- [ ] **Scale-back action**: edit `deploy/main.tf:662` to remove the `instance_type = "m6g.large.search"` + `ebs_volume_size = 20` override and the dated comment block; commit + changeset + push; release pipeline applies (terraform blue/green again, ~20-40 min)
- [ ] **Verify post-scale-back**: `/debug/shadow-config` 2xx-rate stable; v2 cluster GREEN; ADR 031 soak gate restarts if any cluster reconfiguration is needed
- [ ] **Optional follow-up**: file a sibling ADR for performance-budget on the OpenSearch tier (architect recommendation; defer until second occurrence)

## Dependencies

- **Blocks**: ADR 029 step 9 decommission cleanup (the scale-back is part of "return v2 to steady-state cost posture")
- **Blocked by**: populate-success (9/9 states loaded on v2); I001 restored
- **Composes with**: P036 (rotation event that necessitated rebuilt populate); I001 (active incident this scale-up was a response to); P037 (loader close-index race that surfaced via I001)

## Related

- **ADR 029** — step 5 amendment 2026-05-13 (populate-window sizing decoupling), Consequences "AWS cost double-up" line
- **ADR 030** — OpenSearch domain Terraform module; the override seam used to apply the temporary scale-up
- **ADR 031** — read-shadow soak gate (resets on resize per Confirmation amendment 2026-04-29)
- **P035** — shadow-soak validation blind spots (informs the "don't rely on operator memory for scale-back" reasoning)
- **I001** — v2 populate QLD + WA job failures (the active incident this ticket's parent scale-up was a response to)
- **`deploy/main.tf:662`** — the change site for scale-back
