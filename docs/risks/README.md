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

| ID                                                                                    | Title                                                                                       | Category    | Inherent | Residual | Treatment | Owner               | Review     |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------- | -------- | -------- | --------- | ------------------- | ---------- |
| [R003](R003-terraform-apply-touches-prod-eb-during-search-backend-changes.active.md)  | Any production apply redeploys the live EB environment                                      | operational | 16       | 8        | Mitigate  | addressr-maintainer | 2027-02-04 |
| [R004](R004-traffic-sample-counts-in-public-adr-prose.active.md)                      | Traffic figures committed to a public repo (absorbs R011, R016)                             | infosec     | 12       | 9        | Mitigate  | addressr-maintainer | 2027-02-04 |
| [R006](R006-health-probe-couples-elb-pool-to-opensearch-reachability.active.md)       | `/health` couples ELB pool membership to OpenSearch reachability                            | operational | 15       | 10       | Mitigate  | addressr-maintainer | 2027-02-04 |
| [R007](R007-terraform-apply-provision-new-opensearch-domain-release-risk.active.md)   | Provisioning a parallel search domain rides inside the release apply                        | operational | 9        | 6        | Mitigate  | addressr-maintainer | 2027-02-05 |
| [R008](R008-search-backend-cutover-release-residual-above-appetite.active.md)         | Cutover ranking regression passes the health gate and ships silently                        | operational | 16       | 8        | Mitigate  | addressr-maintainer | 2027-02-05 |
| [R009](R009-production-search-backend-major-version-cutover.active.md)                | New backend takes full primary load for the first time at cutover                           | operational | 15       | 8        | Mitigate  | addressr-maintainer | 2027-02-05 |
| [R010](R010-warm-standby-decommission-removes-instant-rollback-net.active.md)         | Warm Standby Decommission Removes Instant Rollback Net                                      | operational | 15       | 5        | Accept    | addressr-maintainer | 2027-02-03 |
| [R012](R012-loader-covered-states-refactor-untested-integration-throw-path.active.md) | COVERED_STATES predicate is tested; the caller composition is not                           | operational | 9        | 6        | Mitigate  | addressr-maintainer | 2027-02-05 |
| [R015](R015-npm-publish-coupled-to-prod-deploy-p039-unresolved.active.md)             | Every npm publish is a production deployment (absorbs R019)                                 | operational | 16       | 8        | Mitigate  | addressr-maintainer | 2027-02-05 |
| [R018](R018-adr-links-problem-ticket-committed-before-ticket-exists.active.md)        | Doc links embed a mutable lifecycle segment (174 repaired, test landed)                     | operational | 10       | 2        | Mitigate  | addressr-maintainer | 2027-02-05 |
| [R020](R020-deploy-path-push-tier-prod-deploy-precondition-unmet.active.md)           | `deploy_only` is now the ONLY infra-apply route, and is exercised only against a no-op plan | operational | 15       | 10       | Mitigate  | addressr-maintainer | 2026-11-10 |
| [R023](R023-release-watch-reports-success-when-docker-publish-job-fails.active.md)    | Watchers report success on a red run (both scripts; observed)                               | operational | 16       | 4        | Mitigate  | addressr-maintainer | 2027-02-04 |
| [R027](R027-deferred-integration-accumulates-unpriced-risk.active.md)                 | The scorer prices the action in front of it against an unscored baseline                    | delivery    | 12       | 9        | Mitigate  | addressr-maintainer | 2027-02-05 |
| [R028](R028-register-curation-unmechanised-so-it-drifts-against-itself.active.md)     | The register's scaffold path is mechanical and its curation path is not                     | delivery    | 8        | 6        | Mitigate  | addressr-maintainer | 2027-02-05 |

## Retired

| ID                                                                                            | Title                                                                 | Retired date | Reason                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [R021](R021-push-tier-deploy-axis-arms-prod-terraform-apply.retired.md)                       | Push-tier deploy axis: production apply at the lowest governance      | 2026-08-10   | Hazard deleted — the `deploy/**` push axis is removed from `release.yml`, so no `git push` can reach a production apply. Its canonical push-tier apply count survives retirement and is still cited by R020 and P083 |
| [R022](R022-unstaged-terraform-lockfile-drift-arms-deploy-axis.retired.md)                    | Unstaged deploy/**.tf drift arms a push-tier prod apply               | 2026-08-10   | Hazard deleted with R021 — the drift was never the hazard, only its ability to arm an unreviewed apply; with no axis there is nothing left to arm                                                                    |
| [R005](R005-read-shadow-sigv4-enabled-in-prod-primary-path-latency-unverified.retired.md)     | Read Shadow Sigv4 Enabled In Prod Primary Path Latency Unverified     | 2026-07-31   | Subject condition no longer holds — the ≤1 ms primary-path invariant was measured and discharged at ≤ ~0.1 ms p95, roughly 10× under the gate                                                                        |
| [R001](R001-aws-managed-opensearch-fgac-password-clobber-on-blue-green.retired.md)            | Aws Managed Opensearch Fgac Password Clobber On Blue Green            | 2026-08-04   | No surface in this architecture — ADR-033 removed FGAC entirely, so there is no master user whose password a blue/green op could reset                                                                               |
| [R011](R011-read-shadow-soak-traffic-count-in-committed-docs.retired.md)                      | Read Shadow Soak Traffic Count In Committed Docs                      | 2026-08-04   | Merged into R004 — same hazard (absolute traffic figures in a public repo), differing only in which instance triggered the hint                                                                                      |
| [R013](R013-severe-but-rare-single-change-uncontrolled.retired.md)                            | Severe But Rare Single Change Uncontrolled                            | 2026-08-04   | Not a hazard — described a score, not a condition that can occur; also misstated the appetite (5 is inclusive, so 5/25 does not breach it)                                                                           |
| [R025](R025-deploy-axis-armed-jtbd400-manual-deploy-path-unexercised.retired.md)              | Deploy Axis Armed Jtbd400 Manual Deploy Path Unexercised              | 2026-08-04   | Merged into R020 — self-declared duplicate, its own description cited R020                                                                                                                                           |
| [R016](R016-read-shadow-soak-traffic-figures-in-committed-docs.retired.md)                    | Read Shadow Soak Traffic Figures In Committed Docs                    | 2026-08-04   | Merged into R004 — its own description had already flagged itself as a duplicate of R011                                                                                                                             |
| [R002](R002-onepassword-v2-credential-sync-deferred.retired.md)                               | Onepassword V2 Credential Sync Deferred                               | 2026-08-05   | No surface in this architecture — ADR-033 removed FGAC, so there is no master-user password for the EB and 1Password planes to diverge on; `ELASTIC_PASSWORD` is empty                                               |
| [R014](R014-cors-preflight-exempts-options-from-proxy-auth-ahead-of-gate.retired.md)          | Cors Preflight Exempts Options From Proxy Auth Ahead Of Gate          | 2026-08-05   | Discharge condition on the entry met — preflight registration is gated behind `ADDRESSR_ACCESS_CONTROL_ALLOW_ORIGIN`, default-off, and exercised by cors-preflight.feature                                           |
| [R017](R017-distroless-docker-image-unverified-no-docker-build-ci.retired.md)                 | Distroless Docker Image Unverified No Docker Build Ci                 | 2026-08-05   | Discharge condition met — docker-image.yml builds on push and verifies non-root user, /health smoke and SIGTERM forwarding, discharging ADR-039 Confirmation criteria                                                |
| [R019](R019-release-ships-fresh-server-lifecycle-code-to-prod-via-coupled-publish.retired.md) | Release Ships Fresh Server Lifecycle Code To Prod Via Coupled Publish | 2026-08-05   | Merged into R015 — self-declared duplicate, confirmed by mechanism: one coupling at release.yml:358, of which this was one payload                                                                                   |
| [R024](R024-ratification-ordering-deviated-adrs-unratified-while-wired.retired.md)            | Ratification Ordering Deviated Adrs Unratified While Wired            | 2026-08-05   | Subject discharged — ADR-039 and ADR-040 both carry `human-oversight: confirmed`, `oversight-date: 2026-07-27`, satisfying ADR-040 Confirmation criterion 1; undischarged Confirmation items are P076's              |
| [R026](R026-adr-039-040-unratified-while-deploy-docker-axes-wired-live.retired.md)            | Adr 039 040 Unratified While Deploy Docker Axes Wired Live            | 2026-08-05   | Merged into R024 — self-declared duplicate, its own description cites R024; retired on the same evidence                                                                                                             |

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
