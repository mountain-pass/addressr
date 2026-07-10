---
'@mountainpass/addressr': patch
---

Remove the read-shadow traffic mirror now that the OpenSearch upgrade cutover is complete (ADR 029). The mirror finished its job warming the new backend before cutover; with the new backend now primary it is redundant. The read-shadow capability remains in the codebase, off by default, for future backend migrations. Self-hosted deployments are unaffected.
