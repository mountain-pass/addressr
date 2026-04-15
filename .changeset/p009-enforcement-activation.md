---
'@mountainpass/addressr': patch
---

chore(prod): activate ADR 024 gateway auth enforcement in Mountain Pass production

Triggers a Terraform re-apply on the `addressr-prod` workspace so the two `ADDRESSR_PROXY_AUTH_*` EB env vars are set from the newly-configured GitHub Actions repo secrets. Application code is unchanged from v2.1.4 — this release exists only to pick up the new TF_VAR values. Self-hosted consumers are unaffected.

Post-deploy, the direct-bypass smoke probe should flip from 200 to 401. Rollback: delete the two repo secrets and cut another patch release.
