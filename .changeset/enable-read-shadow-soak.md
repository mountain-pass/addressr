---
'@mountainpass/addressr': patch
---

Infrastructure: enable read-shadow soak by setting `ADDRESSR_SHADOW_*` EB env
vars to point at the v2 OpenSearch domain (ADR 031 soak gate begin).

`ADDRESSR_SHADOW_HOST` sources from `module.opensearch_v2.endpoint`;
USERNAME/PASSWORD reuse the existing v1 fine-grained-access user (per
ADR 029 step 4). Production behaviour is unchanged for consumers — the
mirror is fire-and-forget with a 3s AbortController timeout and all
failures swallowed. Primary `ELASTIC_*` env vars continue to point at v1.

Starts the ≥48h soak clock per ADR 031 confirmation. Cutover (ADR 029
step 7) is gated on v2 p95 ≤ 1.5× v1 p95 after the soak completes.
