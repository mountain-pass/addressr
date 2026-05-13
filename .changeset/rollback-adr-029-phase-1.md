---
'@mountainpass/addressr': patch
---

Roll back the in-progress search-backend migration: decommission the
parallel v2 OpenSearch cluster and disable the shadow soak path. No
user-facing change; production search continues to serve from the
existing cluster. See ADR 029 Phase 1 rollback amendment 2026-05-14
for rationale and the path to a future re-attempt.
