---
'@mountainpass/addressr': patch
---

Infrastructure: provision parallel v2 OpenSearch domain (ADR 029 Phase 1 step 4).

No user-visible change. Standalone `terraform apply` that creates `module.opensearch_v2.aws_opensearch_domain.this` (engine `OpenSearch_2.19`, instance `t3.small.search`) alongside the existing `search-addressr3-…` domain. The existing domain is untouched throughout Phase 1; production continues serving from v1 until the cutover commit lands at step 7.

Both v1 and v2 use the same fine-grained-access master credentials (per the credential reuse decision in commit `c160621`'s rationale). After this deploy completes, the operator runs `bash scripts/copy-v2-secrets.sh` to populate the V2-named GHA secrets (step 4a), then triggers `populate-search-domain.yml` workflow_dispatch (step 5).

Refs: P028, ADR 029 (proposed), ADR 030 (proposed).
