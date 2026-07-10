---
'@mountainpass/addressr': patch
---

Deepen the /health endpoint to probe OpenSearch, so the service reports unhealthy (503) when its search backend is unreachable instead of always reporting healthy. This lets the deployment platform detect a broken backend connection and roll back automatically, supporting zero-outage backend cutovers (ADR 029). Self-hosted deployments gain the same liveness signal for their own health checks.
