---
'@mountainpass/addressr': patch
---

Fix: AWS rejected the OpenSearch v2 domain `Adr` tag value with `ValidationException: Invalid parameters provided to tagging operation` because AWS tag values disallow commas. Replaced `"029,030"` with `"029-030"`.

Re-attempts the ADR 029 Phase 1 step 4 provisioning that partially failed at run [25031013373](https://github.com/mountain-pass/addressr/actions/runs/25031013373) — npm publish + EB deploy of v2.4.1 succeeded; only the `module.opensearch_v2.aws_opensearch_domain.this` creation errored on tagging. Production was unaffected (still serving from v1).
