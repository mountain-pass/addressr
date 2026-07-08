---
'@mountainpass/addressr': patch
---

Revert the v2 OpenSearch parity domain to the smaller instance class for a longer soak measurement (ADR 029). The larger class reached parity with v1; this measures whether the smaller class can too with full cache warming. The v2 domain carries no production traffic.
