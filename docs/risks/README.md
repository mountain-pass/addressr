# Risk Register

> ISO 31000 / ISO 27001 standing-risk inventory. Per-risk files live alongside this index.

## Purpose

This directory is the **persistent risk register** for this project. It is distinct from:

- `RISK-POLICY.md` — defines the _criteria_ (impact/likelihood scales, appetite, treatment principles).
- `.risk-reports/` — ephemeral **per-change** pipeline risk reports produced by the risk-scorer on each commit/push/release. Auto-deleted after 7 days.
- `docs/problems/` — ITIL problem management (concrete defects and their fixes).

The risk register captures **standing risks** — risks that persist across changes and require ongoing treatment. Each risk has an owner, treatment plan, inherent and residual scores, and review date.

## ISO Mapping

| ISO Clause                               | Artefact in this repo                      |
| ---------------------------------------- | ------------------------------------------ |
| ISO 31000 § 6.4.2 — Risk treatment       | Each risk file's `Treatment` section       |
| ISO 31000 § 6.4.3 — Residual risk        | Each risk file's `Residual Score` section  |
| ISO 31000 § 6.5 — Monitoring and review  | `Review date` field + periodic review pass |
| ISO 27001 § 6.1.2 — Risk assessment      | Risks tagged `category: infosec`           |
| ISO 27001 § 6.1.3 — Risk treatment / SoA | `Treatment` + `Controls` sections          |

## Structure

- One file per risk: `R<NNN>-<kebab-case-title>.<status>.md`
- Status suffixes: `.active.md`, `.accepted.md` (consciously tolerated), `.retired.md` (no longer relevant)
- Risks retired, not deleted — historical record is preserved
- Cross-references to `docs/problems/P<NNN>` and `docs/decisions/ADR-<NNN>` welcome

Template: `TEMPLATE.md`

## Register

| ID  | Title | Category | Inherent | Residual | Treatment | Owner | Review |
| --- | ----- | -------- | -------- | -------- | --------- | ----- | ------ |

| [R001](R001-aws-managed-opensearch-fgac-password-clobber-on-blue-green.active.md) | Aws Managed Opensearch Fgac Password Clobber On Blue Green | pending | — | — | pending | pending | 2026-07-18 |
| [R002](R002-onepassword-v2-credential-sync-deferred.active.md) | Onepassword V2 Credential Sync Deferred | pending | — | — | pending | pending | 2026-07-18 |
| [R003](R003-terraform-apply-touches-prod-eb-during-search-backend-changes.active.md) | Terraform Apply Touches Prod Eb During Search Backend Changes | pending | — | — | pending | pending | 2026-07-18 |
| [R004](R004-traffic-sample-counts-in-public-adr-prose.active.md) | Traffic Sample Counts In Public Adr Prose | pending | — | — | pending | pending | 2026-07-18 |
| [R005](R005-read-shadow-sigv4-enabled-in-prod-primary-path-latency-unverified.active.md) | Read Shadow Sigv4 Enabled In Prod Primary Path Latency Unverified | pending | — | — | pending | pending | 2026-07-18 |
| [R006](R006-health-probe-couples-elb-pool-to-opensearch-reachability.active.md) | Health Probe Couples Elb Pool To Opensearch Reachability | pending | — | — | pending | pending | 2026-07-18 |
| [R007](R007-terraform-apply-provision-new-opensearch-domain-release-risk.active.md) | Terraform Apply Provision New Opensearch Domain Release Risk | pending | — | — | pending | pending | 2026-07-18 |
| [R008](R008-search-backend-cutover-release-residual-above-appetite.active.md) | Search Backend Cutover Release Residual Above Appetite | pending | — | — | pending | pending | 2026-07-18 |
| [R009](R009-production-search-backend-major-version-cutover.active.md) | Production Search Backend Major Version Cutover | pending | — | — | pending | pending | 2026-07-18 |
| [R010](R010-warm-standby-decommission-removes-instant-rollback-net.active.md) | Warm Standby Decommission Removes Instant Rollback Net | pending | — | — | pending | pending | 2026-07-18 |
| [R011](R011-read-shadow-soak-traffic-count-in-committed-docs.active.md) | Read Shadow Soak Traffic Count In Committed Docs | pending | — | — | pending | pending | 2026-07-18 |
| [R012](R012-loader-covered-states-refactor-untested-integration-throw-path.active.md) | Loader Covered States Refactor Untested Integration Throw Path | pending | — | — | pending | pending | 2026-07-18 |
| [R013](R013-severe-but-rare-single-change-uncontrolled.active.md) | Severe But Rare Single Change Uncontrolled | pending | — | — | pending | pending | 2026-07-20 |

## Retired

| ID  | Title | Retired date | Reason |
| --- | ----- | ------------ | ------ |

## Relationship to Other Artefacts

```
RISK-POLICY.md        ──▶ defines impact/likelihood criteria, appetite
      │
      ▼
docs/risks/R<NNN>.*.md ──▶ standing risks, scored against criteria
      │                        │
      │                        ├──▶ treatment cites docs/decisions/ADR-NNN
      │                        └──▶ realised-as links to docs/problems/P<NNN>
      ▼
.risk-reports/*.md    ──▶ per-change pipeline snapshots (ephemeral)
```

## How to Add a Risk

1. Copy `TEMPLATE.md` to `R<NNN>-<title>.active.md` (next free ID).
2. Fill in inherent score using impact × likelihood from `RISK-POLICY.md`.
3. Document controls already in place; compute residual score.
4. Set review date (default: 6 months from creation).
5. Update the "Register" table in this README.
6. Commit with `docs(risks): open R<NNN> <title>`.

## How to Review

On review date, re-assess likelihood and residual score. Update controls as systems evolve. Retire risks that no longer apply (rename to `.retired.md`).
