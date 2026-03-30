# Agentic Coding Risk Register (LLM-First)

## Scope
This register assumes LLM agents perform most coding work. Controls are split per `PRINCIPLES.md`:
- Deterministic controls for cheap, repeatable invariants.
- Independent LLM reviewer controls for semantic quality and intent alignment.

Delivery policy baseline for this register:
- Trunk-based development on `master` is the required operating model, aligned to DORA flow outcomes.
- Long-lived branch-based development is treated as an unacceptable delivery risk for this repository because it increases batch size, delayed feedback, and merge/recovery coupling.
- Zero-trust trunk model: assume unsafe code can land on `master`; do not treat `main` admission as a safety boundary.
- Safety boundary is release/prod promotion: controls must prevent unsafe commits from being promoted/deployed.

## Scales
- Likelihood (`L`): 1 Rare .. 5 Almost certain
- Impact (`I`): 1 Minor .. 5 Critical
- Score: `L x I`

## Zero-Trust Interpretation (Required)
Reviewers must assess residual risk against deployment outcomes, not trunk admission:
- Prevent unsafe promotion/deploy.
- Prove what was deployed (immutable digest + SHA/provenance evidence).
- Detect unsafe release behavior quickly.
- Recover quickly (rollback/redeploy via governed path).

## Risks

| Risk ID | Inherent risk (agentic context) | L | I | Score |
|---|---|---:|---:|---:|
| AR0 | Governance entropy accumulation (stale decision/governance evidence, stale control metadata, overdue assurance reviews) | 5 | 5 | 25 |
| AR1 | Architecture conformance drift: implementation violates agreed architecture constraints (for example forbidden dependencies) | 4 | 5 | 20 |
| AR2 | Fast but unsafe code changes due to weak verification discipline | 4 | 5 | 20 |
| AR3 | Silent accumulation of unresolved TODO/FIXME/HACK markers | 5 | 4 | 20 |
| AR4 | Decision lifecycle debt (proposed decisions not completed, superseded, or retired) | 4 | 4 | 16 |
| AR5 | Traceability drift (risk-control-evidence mappings missing, invalid, or unverified) | 3 | 4 | 12 |
| AR6 | Agents optimize for passing checks while avoiding maintenance work | 4 | 4 | 16 |
| AR7 | Unbounded control overhead (meta-risk) slows delivery without risk reduction | 3 | 4 | 12 |
| AR8 | Dependency risk imbalance: outdated dependencies increase debt/exposure, while rushed upgrades increase instability/supply-chain risk | 4 | 4 | 16 |
| AR9 | Script invocation ambiguity from scattered ad-hoc commands causes inconsistent control execution and missed guardrails | 4 | 3 | 12 |
| AR10 | Credential leakage risk: auth artifacts or secrets are accidentally committed/pushed to the repo | 4 | 5 | 20 |
| AR11 | ~~Red-trunk contamination~~ (retired: self-reinforcing failure loop provided negative value) | - | - | - |
| AR12 | Release promotion bypass risk: changes are submitted for release without all required gates passing on the source SHA | 4 | 5 | 20 |
| AR13 | Delayed feedback risk: critical CI checks become too slow, reducing feedback speed and increasing context-switch cost | 4 | 4 | 16 |
| AR14 | In-flight push overlap risk: new main pushes occur before current trunk pipeline feedback is available | 4 | 4 | 16 |
| AR15 | Application correctness drift: event model/projections/parser behavior regresses as app code grows | 4 | 5 | 20 |
| AR16 | Environment isolation and credential mode risk: shared cloud project or static keys increase blast radius and secret-leak impact | 4 | 5 | 20 |
| AR17 | Manual cloud tinkering bypasses pipeline controls and mutates live service/IAM state outside trunk + release governance | 4 | 5 | 20 |
| AR18 | Break-glass privilege drift: emergency access remains standing or undocumented, reintroducing manual mutation paths | 3 | 5 | 15 |
| AR19 | Oversized local WIP (uncommitted or unpushed) raises recovery cost, increases merge friction, and makes returning trunk to green slower, which erodes small-slice evolution discipline (Gall's law) | 4 | 4 | 16 |
| AR20 | Long-lived branch divergence risk: delayed integration increases merge complexity, slows feedback loops, and degrades delivery performance (DORA flow metrics), reintroducing Gall's curse via complexity built ahead of validated simple working states | 4 | 5 | 20 |

## Residual Risk Governance

| Risk ID | Owner | Status | Review cadence | Trigger threshold | Next review date | Residual L | Residual I | Residual score |
|---|---|---|---|---|---|---:|---:|---:|
| AR0 | Engineering Lead | Open | Monthly | `governance:gate` fails for entropy budgets in 2 consecutive runs | 2026-04-03 | 3 | 4 | 12 |
| AR1 | Engineering Lead | Open | Monthly | Architecture conformance policy violation on `master` (forbidden/missing dependency rules) | 2026-04-03 | 2 | 4 | 8 |
| AR2 | Engineering Lead | Open | Monthly | Unit/app-correctness or supply-chain gates fail on `master` in 2 consecutive runs | 2026-04-03 | 2 | 4 | 8 |
| AR3 | Engineering Lead | Open | Monthly | ESLint warning-comment gate violations > 0 on `master` | 2026-04-03 | 2 | 3 | 6 |
| AR4 | Engineering Lead | Open | Monthly | Proposed decision staleness or required decision-section checks fail | 2026-04-03 | 2 | 3 | 6 |
| AR5 | Engineering Lead | Open | Monthly | Traceability/index or risk-ID bridge validation fails | 2026-04-03 | 2 | 3 | 6 |
| AR6 | Engineering Lead | Open | Monthly | Maintenance freshness or LLM reviewer gate fails twice in 7 days | 2026-04-03 | 2 | 3 | 6 |
| AR7 | Engineering Lead | Open | Monthly | Control count > `max_control_count` or reviewer iterations > budget | 2026-04-03 | 2 | 3 | 6 |
| AR8 | Engineering Lead | Open | Monthly | `dry-aged-deps` gate fails on `master` or publish | 2026-04-03 | 2 | 3 | 6 |
| AR9 | Engineering Lead | Open | Monthly | Orphan script gate fails or runtime gate mismatch occurs in contributor workflow | 2026-04-03 | 2 | 3 | 6 |
| AR10 | Security Lead | Open | Monthly | Secret scan failure or tracked-secret-file breach | 2026-04-03 | 2 | 5 | 10 |
| AR11 | Engineering Lead | Retired | - | - | - | - | - | - |
| AR12 | Engineering Lead | Open | Monthly | Release-readiness or publish verification gate fails on latest release attempt | 2026-04-03 | 2 | 5 | 10 |
| AR13 | Engineering Lead | Open | Monthly | CI fanout duration breaches agreed SLA for 3 consecutive runs | 2026-04-03 | 2 | 3 | 6 |
| AR14 | Engineering Lead | Open | Monthly | In-flight overlap gate blocks pushes more than 3 times in 7 days | 2026-04-03 | 2 | 3 | 6 |
| AR15 | Product Lead | Open | Monthly | App correctness/coverage gates fail on `master` | 2026-04-03 | 2 | 5 | 10 |
| AR16 | Security Lead | Open | Monthly | Cloud policy parity or OIDC/least-privilege checks fail | 2026-04-03 | 2 | 5 | 10 |
| AR17 | Security Lead | Open | Monthly | Cloud governance audit detects unauthorized mutation path | 2026-04-03 | 2 | 5 | 10 |
| AR18 | Security Lead | Open | Monthly | Break-glass evidence/timeliness check fails or privileged drift detected | 2026-04-03 | 2 | 5 | 10 |
| AR19 | Engineering Lead | Open | Monthly | WIP/push-size gates breach critical threshold on `master` path | 2026-04-03 | 2 | 3 | 6 |
| AR20 | Engineering Lead | Open | Monthly | Branch divergence or delayed-integration indicators exceed thresholds | 2026-04-03 | 2 | 4 | 8 |

## Control Classification (Deterministic vs LLM)

Evidence-only view (no narrative claims). Source of truth for control definitions remains `governance/control-traceability.json`.

Boundary rule:
- AR0 = governance/evidence freshness and control-metadata health.
- AR1 = implementation conformance to agreed architecture constraints.
- AR4 = decision lifecycle completion.
- AR5 = risk-control-evidence traceability integrity.

| Risk ID | Control ID(s) | Evidence anchor |
|---|---|---|
| AR0 | `C-AR0-RESIDUAL-REVIEW-DUE-DATE-GATE`, `C-AR0-RISK-APPETITE-GATE`, `C-AR6-MAINTENANCE-FRESHNESS`, `C-AR7-CONTROL-BUDGET-GATE` | `scripts/governance-gate.ts`, `governance/budget.json` |
| AR1 | `C-AR1-C4-ARCHITECTURE-DRIFT-GATE` | `.claude/skills/c4/scripts/c4-lib.mjs`, `.claude/skills/c4-check/scripts/c4-check.mjs`, `governance/architecture-conformance-policy.json` |
| AR2 | `C-AR2-TEST-SOURCE-RATIO`, `C-AR2-CI-SUPPLY-CHAIN-HARDENING`, `C-AR2-LOCAL-RUNTIME-PINNING`, `C-AR2-LOCAL-CONTROLS-DOCTOR`, `C-AR6-LLM-REVIEWER-GATE`, `C-AR11-LOCAL-LINT-GATE` | `scripts/governance-gate.ts`, CI workflows |
| AR3 | `C-AR3-ESLINT-WARNING-COMMENTS`, `C-AR6-LLM-REVIEWER-GATE` | `eslint.config.js`, CI workflows |
| AR4 | `C-AR4-STALE-PROPOSED-DECISIONS`, `C-AR1-DECISION-COMPLETENESS` | `scripts/governance-gate.ts`, decision files |
| AR5 | `C-AR5-DECISION-INDEX-INTEGRITY`, `C-AR5-RISK-ID-BRIDGE-VALIDATION`, `C-AR5-RISK-STACK-DEPTH-GATE` | `scripts/governance-gate.ts`, `governance/control-traceability.json` |
| AR6 | `C-AR6-MAINTENANCE-FRESHNESS`, `C-AR6-LLM-REVIEWER-GATE` | `scripts/governance-gate.ts` (ADR 026: control-outcomes-gate removed) |
| AR7 | `C-AR7-CONTROL-BUDGET-GATE`, `C-AR7-CONTROL-PRUNING-POLICY-GATE`, `C-AR6-LLM-REVIEWER-GATE` | `scripts/governance-gate.ts`, `governance/control-pruning-policy.json` |
| AR8 | `C-AR8-DRY-AGED-DEPS` | hooks + CI workflows |
| AR9 | `C-AR9-SCRIPT-CONTRACT-CENTRALIZATION` | `scripts/governance-gate.ts` |
| AR10 | `C-AR10-SECRET-LEAK-PREVENTION`, `C-AR10-RUNTIME-ENDPOINT-AUTH-THROTTLE` | `scripts/secrets-check.ts`, runtime protection code |
| AR11 | Retired | - |
| AR12 | `C-AR12-RELEASE-READINESS-GATE`, `C-AR12-SERVER-SIDE-RULESETS`, `C-AR12-CLOUDRUN-DEPLOY-VERIFY`, `C-AR12-PUBLISH-SINGLE-FLIGHT`, `C-AR12-DEPLOYED-BUILD-SHA-VERIFY`, `C-AR12-IMMUTABLE-ARTIFACT-PROMOTION`, `C-AR12-ARTIFACT-SIGNATURE-PROVENANCE-VERIFY`, `C-AR12-LIVE-OPS-SYNTHETIC-MONITOR`, `C-AR12-RELEASE-PREVIEW-SMOKE-TEST` | `release.yml`, `release.yml`, `release-pr-preview.yml` |
| AR13 | `C-AR13-CI-PARALLEL-CHECK-FANOUT`, `C-AR13-CI-DURATION-SLA-TELEMETRY-GATE`, `C-TRUNK-CI-OUTAGE-PLAYBOOK-QUALITY`, `C-AR11-RED-TRUNK-RECOVERY-GATE` | CI workflows |
| AR14 | `C-AR14-INFLIGHT-PIPELINE-GATE`, `C-AR11-AR14-RESIDUAL-TELEMETRY-GATE` | `scripts/inflight-pipeline-gate.ts`, CI workflows |
| AR15 | `C-AR15-APP-CORRECTNESS-UNIT-GATE`, `C-AR15-EVENT-SCHEMA-VALIDATION`, `C-AR15-TEST-OBLIGATION-GATE`, `C-AR15-CHANGED-LINES-COVERAGE`, `C-AR15-PER-FILE-COVERAGE-RATCHET`, `C-AR15-WORKBOOK-PARITY-GATE`, `C-AR15-MIGRATION-CONTRACT-GATE`, `C-AR15-ROSTER-IDENTITY-COLLISION-GATE`, `C-AR15-LIVE-PERFORMANCE-GATE`, `C-AR15-A11Y-WCAG-GATE`, `C-AR15-A11Y-CONTRAST-GATE` | app tests, quality gates, CI workflows |
| AR16 | `C-AR16-GCP-PROJECT-ISOLATION`, `C-AR16-KEYLESS-OIDC-DEPLOY-AUTH`, `C-AR16-CI-LEAST-PRIVILEGE-PERMISSIONS`, `C-AR2-CI-SUPPLY-CHAIN-HARDENING` | cloud policy, CI workflows |
| AR17 | `C-AR17-WORKFLOW-DEPLOY-PATH-GATE`, `C-AR17-CLOUD-SERVICE-CONFORMANCE`, `C-AR17-CLOUD-GOVERNANCE-AUDIT`, `C-AR17-IAM-PRIVILEGE-ALLOWLIST` | cloud governance workflows + policy |
| AR18 | `C-AR18-BREAKGLASS-RUNBOOK` | `docs/BREAK_GLASS_RUNBOOK.md`, `scripts/governance-gate.ts` |
| AR19 | `C-AR14-INFLIGHT-PIPELINE-GATE`, `C-AR20-FLOW-TELEMETRY-GATE` | trunk controls + residual risk telemetry (ADR 025: WIP/push-size gate removed) |
| AR20 | `C-AR14-INFLIGHT-PIPELINE-GATE`, `C-AR12-SERVER-SIDE-RULESETS`, `C-AR20-FLOW-TELEMETRY-GATE` | trunk controls + residual risk telemetry |

## Repo status (current)

### Implemented deterministic gates
- Entropy budget and maintenance freshness (`scripts/governance-gate.ts`)
- Residual-risk governance due-date gate for agentic risks (`scripts/governance-gate.ts` + `AGENTIC_RISK_REGISTER.md` + `governance/budget.json`)
- CI enforcement (`.github/workflows/release.yml`, `.github/workflows/release.yml`)
- Control-to-risk traceability gate (`governance/control-traceability.json` validated by `scripts/governance-gate.ts`)
- Risk-id bridge validation in traceability gate (both `AR*` and `R*` IDs) via `scripts/governance-gate.ts`
- Dependency age/security gate (`dry-aged-deps`) in `.githooks/pre-commit`, `.githooks/pre-push`, and both pipelines
- Immutable dependency install gate in CI (`npm ci`) across main and publish workflows
- Local runtime gate blocks mismatched Node versions before tsx/esbuild-backed local controls execute (`scripts/runtime-gate.js`, hooks)
- Script contract centralization gate (orphan script detection in `scripts/governance-gate.ts`)
- Secret leak prevention gate (`scripts/secrets-check.ts` + gitleaks stages in both pipelines with `.gitleaks.toml` + tracked secret file guard in `scripts/governance-gate.ts`)
- Runtime endpoint protection for `/api/project` (Google OIDC auth boundary when enabled, in-memory abuse throttling, bounded payload size) (`app/src/service/runtime-protection.ts` + `app/src/service/server.ts`)
- Red trunk recovery gate (`scripts/red-trunk-gate.ts` via `.githooks/pre-push`)
- Server-side trunk safety gate (`scripts/trunk-server-gate.ts`) in `release`
- Release readiness gate (`.github/workflows/release.yml` + `.github/workflows/release.yml`)
- Publish single-flight serialization (`concurrency` in `.github/workflows/release.yml`)
- Immutable artifact promotion (single image digest deployed to release and prod in `.github/workflows/release.yml`)
- Deployed SHA verification via `/health` on release/prod before promotion (`.github/workflows/release.yml`)
- Parallel check fanout gate in `release` (independent checks run concurrently before build/release steps)
- In-flight pipeline gate (`scripts/inflight-pipeline-gate.ts` via `.githooks/pre-push`)
- App correctness unit-test gate (`npm run test`) in both pipelines
- Initial reconciliation behavior tests (`app/src/domain/reconciliation.test.ts`)
- Initial offline/sync behavior tests (`app/src/offline/sync-state.test.ts`)
- Deterministic workbook parity gate (`scripts/workbook-parity-gate.ts` + `governance/workbook-parity-fixtures.json`) in main/publish pipelines
- Deterministic workbook parity smoke profile (`npm run workbook:parity:smoke` + `governance/workbook-parity-smoke-policy.json`) in main/publish pipelines before full parity
- Deterministic migration contract gate (`scripts/migration-contract-gate.ts` + `app/src/domain/migration.ts` + `governance/migration-contract-fixtures.json`) in main/publish pipelines
- Deterministic roster identity collision gate (`scripts/roster-identity-gate.ts` + `app/src/domain/roster.ts` + `governance/roster-identity-policy.json`) in main/publish pipelines
- Deterministic live performance gate (`scripts/live-performance-gate.ts` + `governance/live-performance-policy.json`) in main/publish pipelines
- App co-located test-obligation gate (`scripts/app-test-obligation-gate.ts` in pre-push and CI)
- App changed-line coverage and per-file coverage ratchet gate (`scripts/app-coverage-gate.ts` + `governance/app-coverage-policy.json` + `governance/app-coverage-baseline.json`)
- Deterministic WCAG A/AA accessibility gate on rendered UI (`scripts/a11y-gate.ts`) in main/publish pipelines
- C4 architecture artefact alignment via portable Claude skills (`/c4`, `/c4-check`) and architect agent advisory, with generated component artifacts under `docs/architecture/generated/`
- Server-side GitHub branch rulesets for `main` and `publish` (`docs/GITHUB_RULESETS.md`)
- Live GitHub ruleset drift audit (`scripts/github-ruleset-audit.ts`) in main/publish pipelines
- Strict publish ruleset required-check context verification (`scripts/github-ruleset-audit.ts`)
- Dedicated GCP project and GitHub OIDC setup (`docs/GCP_SETUP.md`)
- Cloud deploy policy gate (`scripts/cloud-policy-gate.ts`) in both `main` and `publish` pipelines
- Repo-committed cloud policy source-of-truth (`governance/cloud-policy.json`) validated against GitHub vars and live project metadata in `cloud-governance-audit`
- Artifact signature/provenance gate (`cosign` keyless sign+verify) before deployment in both `main` and `publish` pipelines
- Post-deploy Cloud Run conformance checks (ingress + invoker IAM + runtime service account) in `verify-*` stages
- Residual-risk telemetry threshold gate for AR13/AR14/AR20 (`scripts/residual-risk-gate.ts` + `governance/residual-risk-policy.json`) runs as a hard gate on push pipelines and in nightly governance workflow
- Scheduled live operations synthetic monitor for release/prod health (`scripts/live-ops-health-gate.ts` + `governance/live-ops-policy.json` + `.github/workflows/live-ops-monitor.yml`)
- Scheduled cloud governance audit (`.github/workflows/cloud-governance-audit.yml`) for IAM/OIDC conformance and non-pipeline mutation detection
- Cloud governance provenance validation requiring approved GitHub OIDC subject claims for deploy-SA mutations
- Privileged IAM allowlist enforcement for `owner`, `editor`, `projectIamAdmin`, `serviceAccountAdmin` in cloud governance audit
- Break-glass runbook with temporary conditional access and reconciliation requirements (`docs/BREAK_GLASS_RUNBOOK.md`)
- Break-glass evidence schema/timeliness gate in governance gate (`scripts/governance-gate.ts` + `governance/maintenance-log.jsonl`)
- Local runtime pinning for deterministic local controls (`package.json` engines + `.nvmrc` + `.node-version`)
- Local controls doctor for bootstrap/operability (`scripts/controls-doctor.ts`) wired into pre-commit and pre-push
- One-command local bootstrap for controls operability (`scripts/bootstrap-local.sh` + `npm run bootstrap:local`)

### Implemented LLM reviewer gates
- Independent reviewer LLM gate in CI via provider adapter with default `pi-ai` (advisory on push pipelines, hard in nightly governance workflow)
- Policy-driven scoring and threshold (`governance/llm-review-policy.json`)
- Structured output contract enforced by `scripts/llm-review.ts`
- Change-aware reviewer prompt uses full-diff chunk coverage with bounded retry loop from policy `max_iterations` (`scripts/llm-review.ts`)

## Control Philosophy
- Keep deterministic gates minimal, fast, and non-negotiable.
- Use LLMs for semantic review only, never same-session self-review.
- Force energy into the system via hard entropy budgets plus reviewer checks for anti-gaming.
- Prefer feedback speed over heavy upfront process.

## Latest Governance Additions
- `C-AR0-RISK-APPETITE-GATE`: deterministic appetite-policy validity gate (business thresholds + high-consequence risk mapping) enforced via `scripts/governance-gate.ts`.
- `C-AR6-INCIDENT-REHEARSAL-FRESHNESS`: deterministic freshness gate for incident/tabletop/break-glass rehearsal evidence in `governance/maintenance-log.jsonl`.
- `C-AR5-RISK-STACK-DEPTH-GATE`: deterministic minimum-control-depth policy for selected high-materiality ISO risks enforced via `scripts/governance-gate.ts`.
- `C-AR7-CONTROL-PRUNING-POLICY-GATE`: deterministic validation of control-pruning policy thresholds tied to delivery metrics in `governance/control-pruning-policy.json`.
