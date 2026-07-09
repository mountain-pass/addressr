---
'@mountainpass/addressr': patch
---

Set the v2 OpenSearch domain to the larger instance class as the confirmed steady-state sizing for the 2.19 engine (ADR 029). Measurement showed the smaller class cannot serve 2.19 at parity with v1 under load, while the larger class matches and slightly beats it. The v2 domain still carries no production traffic; cutover remains a later gated step.
