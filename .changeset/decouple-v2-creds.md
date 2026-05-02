---
'@mountainpass/addressr': patch
---

Infrastructure: decouple v2 OpenSearch credentials from v1 (ADR 029
amendment 2026-04-29; fixes P028).

ADR 029 step 4's original "v2 reuses creds" rationale held until P028:
TFC's workspace value for `var.elastic_password` had drifted from EB's
`ELASTIC_PASSWORD` env var, so every release re-set v2's master_user_password
to TFC's value while EB sent a different value. v2 silently 401'd every
read-shadow request after ADR 031 enable. Soak window invalidated.

This commit:

- Adds `var.elastic_v2_username` / `var.elastic_v2_password` to deploy/vars.tf
- Switches v2 module call + EB ADDRESSR*SHADOW*\* env vars to the new vars
- Wires release.yml to pass `TF_VAR_elastic_v2_*` from GHA secrets
- Records the decision in ADR 029 (Step 4 amendment), ADR 030 (Neutral note
  — "distinct credentials per parallel domain"), and ADR 031 (Confirmation
  gap — soak gate must verify 2xx, not just invocation count)

**Operator action required before merging the Release PR**: confirm GHA
secrets `TF_VAR_ELASTIC_V2_USERNAME` and `TF_VAR_ELASTIC_V2_PASSWORD` hold
real, intended values (the `copy-v2-secrets.sh` defaults pointed at a 1P
path that doesn't resolve in this user's vault, so values may be unintended).
The TFC workspace must also have `elastic_v2_username` and `elastic_v2_password`
set to the same values. Divergence between TFC, GHA, and EB is the failure
mode P028 captured. Restart the ADR 031 soak window after this lands.
