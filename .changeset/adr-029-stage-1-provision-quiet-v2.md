---
'@mountainpass/addressr': patch
---

Provision the parallel v2 OpenSearch domain (`addressr4`, engine 2.19) for the ADR 029 Phase 1 re-attempt: quiet, with no query traffic and no shadow mirroring yet. The API keeps serving from the current cluster; cutover is a later, separately gated step. Audit logs are enabled at provisioning and sizing is steady-state from day one.
