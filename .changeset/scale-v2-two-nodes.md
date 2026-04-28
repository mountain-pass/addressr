---
'@mountainpass/addressr': patch
---

Infrastructure: scale v2 OpenSearch domain to 2 nodes (ADR 029 Phase 1 step 6a).

Brought forward from the original pre-cutover position after step 5's WA leg
failed against the single-node config: VIC's 80-min bulk load left the cluster
RED with 13 unassigned shards and addressr search returning 503. ADR 029 step
6a was always going to do this; the WA failure proves the single-node config
is not viable at the data scale, not just at cutover time. Triggers an
AWS-managed blue/green node-add (typically 30–60 min). v1 (search-addressr3)
unchanged; no user-visible change.
