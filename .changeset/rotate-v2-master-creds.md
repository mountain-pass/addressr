---
'@mountainpass/addressr': patch
---

Rotate v2 OpenSearch master user credentials to restore the ADR 031
read-shadow soak gate (P036).

The v2 cluster's FGAC master user password drifted out of sync with
every credential plane we control (EB env, 1Password, GHA secret all
agreed — only the cluster diverged). Per P036 investigation, the drift
happened via the OpenSearch `_plugins/_security/api/internalusers/*`
REST API path, invisible to CloudTrail because it bypasses the AWS
control plane. Root cause of the drift itself remains unverifiable
without OpenSearch audit logs (separate hardening task).

This changeset triggers the release-pipeline deploy step. The deploy
reads the freshly-rotated `TF_VAR_ELASTIC_V2_PASSWORD` GHA secret and
applies it to both `aws_opensearch_domain.master_user_password` and
EB's `ADDRESSR_SHADOW_PASSWORD` env var from the same Terraform
variable (deploy/main.tf:140 + deploy/modules/opensearch/main.tf:24).
Post-deploy smoke check on `/debug/shadow-config` (release.yml R3
guard) asserts `hostSet: true` and a clean `lastError.class` —
sufficient signal to confirm the rotation took effect.

No source code changes. The audit-log hardening that would prevent
the next instance of this failure mode is captured under P036's
remaining investigation tasks and will ship under its own ADR.
