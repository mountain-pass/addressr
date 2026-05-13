---
'@mountainpass/addressr': patch
---

Scale v2 OpenSearch up for the populate window (P036/I001 mitigation).

v1 (`search-addressr3`) handles its production workload on
`t3.small.search` × 2 because it only serves steady-state queries
(quarterly G-NAF refreshes are small deltas). v2 (`search-addressr4`)
is being asked to do a full from-scratch 16.8M-doc populate WHILE
serving shadow soak queries, which overwhelmed the t3.small cluster
(populate run 25731879773 hit `snapshot_in_progress_exception` on
QLD + WA per I001; retry run 25762661760 hung 2h+ on QLD with shadow
success rate dropping from 95% to 52%).

Per ADR 029 step 5 amendment 2026-05-13: populate-window v2 sizing
is decoupled from steady-state v2 sizing. Override
`module "opensearch_v2"` (deploy/main.tf:662) with
`instance_type = "m6g.large.search"` and `ebs_volume_size = 20` for
the populate window. Scale-back to `t3.small.search` × 2 + 10 GB EBS
is tracked by P038 with explicit close-trigger (populate-success).

terraform apply triggers an AWS-managed blue/green deployment on v2
(~20-40 min, zero-downtime). The resize resets the ADR 031 soak gate
— `/debug/shadow-config` 2xx-rate must be verified clean post-resize
before any new 48h soak window starts counting per ADR 031
Confirmation amendment 2026-04-29.

Cost impact: ~$1.66 one-time incremental for the populate window
(~6h at m6g.large.search × 2). Steady-state cost returns to baseline
when P038's scale-back lands.
