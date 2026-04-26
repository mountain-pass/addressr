# Problem 028: OpenSearch 1.3.20 version debt — increasing exposure to bugs, EOL and compatibility drift

**Status**: Known Error
**Reported**: 2026-04-21
**Transitioned to Known Error**: 2026-04-21
**Priority**: 15 (High) — Impact: Moderate (3) x Likelihood: Almost certain (5)

## Description

addressr's production search backend is an **AWS-managed OpenSearch Service** domain (`search-addressr3-….aos.ap-southeast-2.on.aws`) running the **OpenSearch 1.3 engine family** (believed to be 1.3.x — exact engine version still to be confirmed via the AWS console / API; local Docker and the npm client are pinned to 1.3.20). Local development and CI use the `opensearchproject/opensearch:1.3.20` Docker image (see `package.json` `SEARCH_IMAGE`). The Node.js client is pinned at `@opensearch-project/opensearch@^3.5.1`. OpenSearch 1.3 is the final release of the 1.x major line and is past its support horizon; 2.x is the current stable major (2.19+ as of Q1 2026) and 3.x is also available upstream. Staying on 1.3 is accumulating a set of negatives that are independent of any single defect.

This problem captures the **version debt itself**, not any individual bug caused by it. Specific bugs that the debt is suspected to cause or perpetuate are tracked separately (e.g., [P027](./027-synonym-expansion-bypasses-auto-fuzziness.open.md) — synonym-expansion fuzziness interaction in `match_bool_prefix`). The cost of P028 is the ongoing risk exposure across all the following axes simultaneously, and the stranded improvement value in newer releases.

### What we're missing and exposed to

| Axis                               | Impact of staying on 1.3.20                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Security patches**               | OpenSearch 1.3.x receives only limited security backports; CVEs patched in 2.x/3.x land on 1.x on a best-effort basis at most. Each month on 1.3.20 widens the window where a newly-disclosed CVE may be unpatched on our instance.                                                                                                                    |
| **Bug fixes in search behaviour**  | 2.x has accumulated query-builder fixes and query-planner improvements. P027's `match_bool_prefix` + synonym + fuzziness interaction is one candidate. Other latent bugs we haven't noticed yet are likely waiting.                                                                                                                                    |
| **New query DSL features**         | `combined_fields`, improved `runtime fields`, the new `knn` / vector search stack, `point_in_time` search, and other 2.x-era features are unavailable. Some of these would be direct improvements for our ranking work (ADR 025 / ADR 026 / ADR 027 / ADR 028) or enable new product features (semantic address search) that we cannot currently ship. |
| **Performance**                    | OpenSearch 2.x has repeatedly improved indexing throughput, aggregation performance, and memory/heap behaviour. Our loader (full AU G-NAF) pays the 1.3.20 runtime cost every deploy.                                                                                                                                                                  |
| **Client-library support horizon** | `@opensearch-project/opensearch@^3.5.1` advertises compatibility with both 1.x and 2.x today, but 1.x compatibility will be dropped in a future client major. When that happens we would be forced into either a rushed upgrade or pinning an old client version — both bad.                                                                           |
| **AWS support**                    | AWS-managed OpenSearch retires older versions. An EB-hosted 1.3.20 domain today can be migrated to 2.x via the upgrade path; running beyond the vendor's retirement window converts a planned migration into a forced one.                                                                                                                             |
| **Feature-work drag**              | Every new feature we design pays a tax of "but check it works on 1.3 first". ADR 021 (Retain OpenSearch with future multi-backend support) explicitly flags 1.3.x EOL as a reassessment trigger for the backend-abstraction direction.                                                                                                                 |
| **Team knowledge drift**           | Stack Overflow, OpenSearch/Elasticsearch upstream docs, and third-party tutorials increasingly assume 2.x or later. Onboarding and debugging get harder as time passes.                                                                                                                                                                                |

Reported during the v2.4.0 post-deploy investigation (2026-04-21). Note that the trigger for filing this problem is **independent** of P027 — the upgrade case stands on its own even if P027 turns out to be fixable without an upgrade.

## Symptoms

- Security advisories published for 2.x/3.x require manual investigation to determine whether 1.3.x is affected and whether a backport exists.
- Bug workarounds accumulate in our code rather than being absorbed by newer upstream behaviour (example: the custom `whitecomma` tokeniser + `AUTO:5,8` fuzziness tuning in ADR 027 would interact more predictably with a query builder that has fewer known quirks — 1.x is slow to receive those fixes).
- Design reviews stall on "what would 2.x make possible here?" when weighing new features (e.g., semantic or vector search).
- `@opensearch-project/opensearch` changelog increasingly emphasises 2.x / 3.x compatibility; 1.x-specific code paths are frozen.

## Workaround

**Stay on 1.3.20 and accept the accumulating risk** — current posture. Monitor:

- AWS EB OpenSearch retirement announcements for 1.x.
- OpenSearch project security advisories.
- `@opensearch-project/opensearch` release notes for 1.x deprecation signals.

This is not a long-term workaround — it is an acknowledgement that we are on borrowed time.

## Impact Assessment

- **Who is affected**: Addressr Contributor/Maintainer persona (J7 — Ship releases reliably from trunk) directly — the version debt distorts every design and testing decision. Indirectly, all end-user personas (Web/App Developer, AI Assistant User, Data Quality Analyst, Self-Hosted Operator) via latent bugs that accumulate until a forced upgrade.
- **Frequency**: Continuous — the debt compounds every week. The moment it matters acutely will be one of: a security CVE with no 1.3 backport, a vendor retirement deadline, a client-library drop, or a bug (like P027) that has a clean fix only in 2.x/3.x.
- **Severity**: Moderate today, Significant or Severe once a trigger fires. Today this manifests as release-pipeline and design-drag effects (Impact 3) rather than user-visible failures. Likelihood is Likely (4) because at least one trigger is already in view (P027 as a candidate, AWS retirement schedule ticking).
- **Analytics**: N/A — this is a deliberate programmatic assessment, not a data-driven one.

## Root Cause Analysis

### Why we're on 1.3.20

The repository history shows 1.3.x was pinned when the project first stabilised. No explicit decision record blocks upgrading; ADR 021 (Retain OpenSearch, plan multi-backend) frames OpenSearch as the accepted engine and flags 1.3.x EOL as a **reassessment trigger** rather than a hard commit to 1.x. No ADR proposes an upgrade schedule.

### Why the upgrade keeps getting deferred

- It requires ops work (AWS EB domain upgrade or migration, Terraform module updates, snapshot/restore or reindex).
- It requires testing work (full Cucumber suite against 2.x, G-NAF loader validation, search-behaviour regression run against the 14-query baseline + extensions).
- It has been easier to ship feature work on 1.3 than to pause and upgrade.
- Each deferral looks cheap in isolation; cumulative cost is what this ticket captures.

### Investigation Tasks

- [x] Confirm OpenSearch 1.3.x official EOL / retirement date and the AWS OpenSearch Service retirement schedule. Record in this ticket. _(see "Upstream and AWS EOL findings" below, 2026-04-21)_
- [ ] Audit open CVEs against OpenSearch 1.3.x that are patched in 2.x/3.x. Publish the list in this ticket. _(partial — see "CVE status" below; full enumeration still pending a direct NVD / OpenSearch advisory scrape)_
- [ ] Confirm the exact OpenSearch engine version running on the AWS-managed `search-addressr3-….aos.ap-southeast-2.on.aws` domain (AWS console / `aws opensearch describe-domain`). The client and local Docker are on 1.3.20; production engine version needs explicit verification.
- [ ] Scope the upgrade path on AWS-managed OpenSearch Service: in-place engine upgrade (1.3 → 2.x via AWS console / API / Terraform) vs blue/green domain swap (`search-addressr4-…`) with reindex from G-NAF source. AWS handles snapshot/restore under the hood for in-place; the blue/green path is our lever if we want zero-risk rollback. Document options + decision criteria.
- [ ] Spin up `opensearchproject/opensearch:2.19` locally (shared with P027 investigation). Run the Cucumber suite and the 14-query baseline against it. Note any behavioural deltas.
- [ ] Enumerate OpenSearch 2.x features that would unlock addressr product value (vector / knn, point_in_time, improved aggregations, bulk indexing ergonomics). Quantify the value where possible.
- [x] Check `@opensearch-project/opensearch` client's stated 1.x deprecation timeline. _(see "Client library status" below, 2026-04-21)_
- [x] Create an INVEST story / ADR for the upgrade once the plan options are scoped. Supersede or amend ADR 021's "retain 1.x" posture. _(2026-04-21 — [ADR 029](../decisions/029-opensearch-blue-green-two-phase-upgrade.proposed.md) drafted (proposed) with two-phase blue/green plan; [ADR 030](../decisions/030-opensearch-domain-terraform-module.proposed.md) drafted (proposed) for the Terraform-managed domain. ADR 029 amends ADR 021 on the version axis; retain-OpenSearch and multi-backend directions preserved. P028 transitions to Known Error on ADR 029 acceptance per ADR 029's Confirmation section.)_
- [ ] Create a reproduction test that catches regressions during the upgrade — baseline the Cucumber + unit suite on 1.3.20, diff against 2.x locally. _(Scope carried into ADR 029 Phase 1: local Cucumber + 14-query symmetric-SSLA baseline ([ADR 025](../decisions/025-search-ranking-symmetric-ssla.accepted.md)) run against `opensearchproject/opensearch:2.19` before cutover. The comparison itself becomes the regression test.)_

### Research findings (2026-04-21)

#### Upstream and AWS EOL findings

- **Upstream OpenSearch 1.x**: deprecated 2025-05-06 per [endoflife.date/opensearch](https://endoflife.date/opensearch). **No more upstream security patches or bug fixes ship for the 1.x line as of that date.** We are 11 months past deprecation as of this ticket update. Active development on 1.x ended 2022-05-26 (per the same source); 2025-05-06 was the end of maintenance support.
- **Final 1.3.x release**: 1.3.20, published 2024-12-11. This is the version we run. No further 1.3.x releases are expected.
- **AWS OpenSearch Service** per the [AWS Big Data Blog support-dates announcement (Nov 2024)](https://aws.amazon.com/blogs/big-data/amazon-opensearch-service-announces-standard-and-extended-support-dates-for-elasticsearch-and-opensearch-versions/):
  - OpenSearch **1.0–1.2**: End of Standard Support **2025-11-07**, End of Extended Support **2026-11-07**.
  - OpenSearch **1.3**: support dates **"Not announced"** at time of writing — AWS recommends 1.2 users upgrade to 1.3 as an interim step.
  - OpenSearch versions supported in 2026: 3.5, 3.3, 3.1, 2.19, 2.17, 2.15, 2.13, 2.11, 2.9, 2.7, 2.5, 2.3, and 1.3.
- **Applicability correction (supersedes earlier draft in this section)**: addressr production runs on **AWS-managed OpenSearch Service**, not self-hosted Docker. The Elastic Beanstalk application (`deploy/main.tf`) receives `ELASTIC_HOST` as a Terraform variable pointing at an AWS-managed domain (`search-addressr3-….aos.ap-southeast-2.on.aws`); the domain itself is managed outside Terraform. The `opensearchproject/opensearch:1.3.20` Docker image is used for local/CI only. This means the AWS Standard/Extended Support schedule applies **directly** to production — when AWS announces 1.3 dates, we face a hard deadline, not advisory pressure. When the deadline is published, the upgrade ticket should inherit that date as its "force-by" constraint.

#### Client library status

- `@opensearch-project/opensearch` latest: **3.5.1** (2025-04-04) per [opensearch-project/opensearch-js releases](https://github.com/opensearch-project/opensearch-js/releases). We pin `^3.5.1`, so we are current on the client.
- **3.0 was the breaking rewrite** (January 2025): over 100 new API functions generated from the spec; dropped Node.js 10/12 (requires 14+); HTTP method overrides removed.
- **1.x server compatibility**: per the opensearch-js COMPATIBILITY matrix, client 2.x is compatible with OpenSearch 1.x; the client direction is spec-driven and the spec increasingly reflects 2.x/3.x-only features. **No published 1.x-drop date exists for the client today**, but the risk is embedded: when a 2.x/3.x-only API is exercised, the client will expose it regardless of whether the server supports it.
- **Risk we did not find evidence for**: we have not seen a published deprecation timeline for 1.x-server support in the client. This is a soft risk, not a dated one — but given upstream 1.x is already EOL, it is plausible that a future client major will formally drop 1.x-server validation without a long notice period.

#### CVE status (partial)

- Comprehensive 2024–2026 CVE enumeration deferred (cvedetails.com returned 403 on automated fetch; needs a different data source — OpenSearch project security advisories on GitHub or NVD direct search).
- Verified so far:
  - CVE-2023-31419 (StackOverflow DoS in `_search`): fixed in 1.3.14 and 2.11.1 — 1.3.20 carries this fix.
  - CVE-2023-45807 / GHSA-8wx3-324g-w4qq: fixed in 1.3.14 and 2.11.0 — 1.3.20 carries this fix.
- **Implication of upstream EOL (2025-05-06)**: any CVE disclosed against OpenSearch code paths **after** 2025-05-06 will not receive an upstream 1.3.x patch. For **production** (AWS-managed OpenSearch Service) AWS is responsible for engine-level patching and typically carries security backports during Standard Support and (with additional fees) Extended Support — but AWS has not yet announced 1.3 support dates, and its backport reach for an upstream-EOL major is not guaranteed. For **local/CI** (`opensearchproject/opensearch:1.3.20` Docker) no further patches will arrive at all; CI's realistic tolerance for running EOL software is higher than production's, but security-scanning tooling (Dependabot, Trivy) will increasingly flag it.

#### Implications for priority

Updated to **15 (High) — Impact: Moderate (3) × Likelihood: Almost certain (5)** on 2026-04-21. The prior "12 (High) — Likelihood Likely (4)" line under-stated reality: the **security-patch drought** trigger already fired on 2025-05-06 (upstream 1.x end-of-maintenance, 11 months before this ticket), and AWS has not published 1.3 Standard/Extended Support dates — so at least one material trigger is already active and another is pending publication. The Impact rating (Moderate, 3) is unchanged; the version debt still manifests today as release-pipeline and design-drag rather than user-visible failure. Label remains "High" (10–16 band). Re-score anchored to the existence of the upgrade plan ADRs ([ADR 029](../decisions/029-opensearch-blue-green-two-phase-upgrade.proposed.md) and [ADR 030](../decisions/030-opensearch-domain-terraform-module.proposed.md), both proposed 2026-04-21).

#### Known Error transition (2026-04-21)

Transitioned Open → Known Error on 2026-04-21. Pre-flight checks:

- **Root cause documented**: yes — both "Why we're on 1.3.20" and "Why the upgrade keeps getting deferred" sections, plus upstream EOL, AWS schedule, and client-library research.
- **Investigation tasks progressed**: yes — three tasks checked off (EOL confirmation, client status, upgrade ADR drafted).
- **Reproduction test referenced**: yes — ADR 029 Phase 1 step 4 specifies the local Cucumber + 14-query symmetric-SSLA baseline run against `opensearchproject/opensearch:2.19` as the regression test; the delta between 1.3.20 and 2.19 becomes the assertion.
- **Workaround documented**: yes — "Stay on 1.3.20 and monitor" in the Workaround section.

Fix path is clear via ADRs 029 and 030 (both proposed). Closure (this file → `.closed.md`) is gated on ADR 029 Phase 1 cutover being verified in production, consistent with the `## Fix Released` → verify-then-close workflow.

#### ADR 030 module scaffolded (2026-04-24)

Scaffolded `deploy/modules/opensearch/` per [ADR 030](../decisions/030-opensearch-domain-terraform-module.proposed.md)'s module shape:

- `versions.tf` — matches root `deploy/versions.tf` (AWS provider, `required_version >= 0.13`; no backend block in the module)
- `variables.tf` — `name`, `engine_version`, `instance_type` (default `t3.small.search`), `instance_count`, `ebs_volume_size`/`ebs_volume_type`, `master_user_name`/`master_user_password` (sensitive), `tags`. VPC/subnet vars deliberately omitted in this module version; comment explains deferral to a future network-hardening ADR.
- `main.tf` — single `aws_opensearch_domain` resource with `advanced_security_options` (fine-grained access), `node_to_node_encryption`, `encrypt_at_rest`, `domain_endpoint_options { enforce_https, tls_security_policy = "Policy-Min-TLS-1-2-2019-07" }`, and a permissive `access_policies` JSON block that mirrors `search-addressr3-…`'s app-layer-auth posture. Inline comment flags network-level hardening as a future-ADR candidate.
- `outputs.tf` — `endpoint` (feeds `ELASTIC_HOST`), `arn`, `domain_name`.
- `README.md` — pointers to ADR 029 + ADR 030 and a minimal usage snippet.

`terraform fmt -check -diff` passes. No change to `deploy/main.tf` — module is not yet called, so `terraform plan` against the existing workspace shows no diff for `search-addressr3-…` (ADR 030 Confirmation line satisfied). Architect review PASS and JTBD review PASS (J7 served; J6 correctly scoped out) captured in the session transcript.

Satisfies the **"implemented"** half of ADR 029's Confirmation line:

> ADR 030 is `proposed` and its module (`deploy/modules/opensearch/`) is implemented and applied to real infra before any `ELASTIC_HOST` change in `deploy/main.tf`.

The **"applied to real infra"** half remains open and is a user-led step (requires AWS creds + credential wiring for `master_user_name`/`master_user_password` through the 1P → GH Actions → Terraform path). Next actions, in order:

1. Wire `module "opensearch_v2"` call into `deploy/main.tf` pointing at `search-addressr4` on engine `OpenSearch_2.19`.
2. Extend `deploy/vars.tf` / CI secrets for the new domain's `master_user_*`.
3. `terraform apply` to stand up `search-addressr4-…` (parallel to `search-addressr3-…`; ADR 030 Confirmation: `terraform plan` must show zero changes to `search-addressr3-…`).
4. Execute ADR 029 Phase 1 steps 2–7 (SEARCH_IMAGE bump, G-NAF reindex, Cucumber + 14-query SSLA baseline against 2.19, cutover, smoke test, 7-day soak).

Both ADRs remain `proposed` — per ADR 029's Confirmation, both promote to `accepted` together after the 7-day soak.

#### Module wired into `deploy/main.tf` (2026-04-24)

Wired the scaffolded `deploy/modules/opensearch/` into the root Terraform module — Phase 1 step 1 (parallel provisioning) is now **code-complete**.

Changes:

- `deploy/vars.tf` — added two new defaulted root vars: `elastic_v2_name` (default `"search-addressr4"`) and `elastic_v2_engine_version` (default `"OpenSearch_2.19"`). Both `nullable = false`, matching the `var.elasticapp` pattern.
- `deploy/main.tf` — added a `module "opensearch_v2"` block at the bottom that calls `./modules/opensearch` with the new v2 vars plus `master_user_name = var.elastic_username` and `master_user_password = var.elastic_password`. **Credential reuse** (Option A): the same fine-grained access creds are applied as master user on both `search-addressr3-…` (provisioned manually, out-of-IaC) and `search-addressr4-…` (new, IaC'd). This preserves ADR 029 Phase 1 step 5's single-variable cutover contract (only `var.elastic_host` changes at cutover).
- `ELASTIC_HOST` in the EB env-var block is **unchanged** — still sourced from `var.elastic_host` pointing at `search-addressr3-…`. Cutover is a Phase 1 step 5 concern, not today's.
- No new GHA secrets. No new 1Password items. The v2 domain inherits the existing `TF_VAR_elastic_username` / `TF_VAR_elastic_password` wiring from `.github/workflows/release.yml` unchanged.

Architect review PASS and JTBD review PASS (both continued-J7, no persona gap, no new ADR needed). `terraform fmt -check -diff` passes.

**What `terraform plan` will show after this commit** (against the existing prod workspace): one new resource to create — `module.opensearch_v2.aws_opensearch_domain.this`. Zero changes on the existing `search-addressr3-…` domain (it is not in state), satisfying ADR 030 Confirmation.

**Next action (user-led)**: `terraform apply` from the prod workspace to stand up `search-addressr4-…` in parallel. After that succeeds:

- Record the module output `module.opensearch_v2.endpoint` for later cutover reference.
- Proceed with ADR 029 Phase 1 remaining steps (G-NAF load, validation, cutover, smoke, soak).

**Superseded by the 2026-04-24 Phase 1 reorder below** — the "next action" above still names `terraform apply` first, but the reordered Phase 1 puts local validation ahead of AWS provisioning to defer spend. Use the reordered sequence in the next subsection.

#### ADR 029 Phase 1 reordered (2026-04-24)

Amended ADR 029's Phase 1 step order (in-place edit; ADR is still `proposed`, no supersession needed) to defer AWS spend until local validation on engine 2.19 is green. User direction: "test locally before we deploy a 2.19 instance and start incurring $$$".

**Decision outcome unchanged** — still two-phase blue/green, 2.19 first, reindex-from-G-NAF, zero-outage. Only the internal ordering of Phase 1 changed. Earlier commits (module scaffolded in `deploy/modules/opensearch/`, module wired in `deploy/main.tf`) remain valid — both were order-neutral with respect to local-first vs AWS-first, and neither performed any `terraform apply`.

**New Phase 1 order** (see ADR 029 for full text):

1. Bump local + CI `SEARCH_IMAGE` to `opensearchproject/opensearch:2.19.x` (both `package.json` and `.github/workflows/release.yml` services.opensearch.image in lockstep).
2. Local validation: Cucumber suite + ADR 025 14-query SSLA baseline against local 2.19; co-investigate P027.
3. Gate on version-upgrade regressions (P027 is co-investigated, not gating). No AWS spend until green.
4. `terraform apply` — stand up `search-addressr4-…`. AWS spend begins here.
5. G-NAF loader against `search-addressr4-…`.
6. Re-run Cucumber + baseline against `search-addressr4-…` (catches AWS-managed-specific deltas).
7. Cutover via `ELASTIC_HOST` flip.
8. Smoke + rollback window.
9. 7-day soak + decommission `search-addressr3-…`.
10. Update ADR 002 Confirmation + ADR 021 reassessment note + promote ADR 029 and ADR 030 to `accepted`.

Architect review PASS and JTBD review PASS (strengthens J7 via cheap fail-fast gate; J1–J5 unaffected; J6 unchanged). Three coherence advisories from architect applied: Phase 1 preamble explains the reorder; step-4 prose keeps the ADR 030 "applied to real infra at least once" dependency where it now belongs; the "Bad" consequence on ADR 030 coupling is reworded from "Phase 1 is blocked" to "Phase 1 cutover is blocked". Step 3 makes P027's non-gating role explicit.

**Next action (user-led, reordered)**: step 1 — bump `SEARCH_IMAGE` in `package.json` and `.github/workflows/release.yml`. This is a small, reversible config-only change; `terraform apply` should NOT run until step 3's gate is green.

#### ADR 029 Phase 1 dual-version testing (2026-04-26)

User-flagged correction to step 1: a single-version "bump" replaces 1.3.20 with 2.19, but during the parallel-domain window (steps 4–9) the **same app binary must work against both 1.3.20 and 2.19** because cutover (step 7) flips only `ELASTIC_HOST` and rollback flips it back. A 2.19-targeted fix that breaks 1.3.20 compatibility would mean rollback fails silently — exactly the zero-outage failure ADR 029 line 20 prohibits.

**Fix (committed in this commit)**: step 1 now **adds 2.19 alongside 1.3.20** rather than replacing it. CI runs a `strategy.matrix.opensearch_version: ["1.3.20", "2.19"]` matrix on the `build-and-test` job with `fail-fast: false`. The 1.3.20 leg is dropped at step 9 as part of decommission. `package.json` carries per-version `SEARCH_IMAGE_1_3_20` and `SEARCH_IMAGE_2_19` constants plus per-version `start:open-search:1.3.20` / `:2.19` and `pull:open-search:1.3.20` / `:2.19` scripts; the default `SEARCH_IMAGE` flips from 1.3.20 to 2.19 (matching the post-cutover target). CI `ES_JAVA_OPTS` bumped from `-Xms512m -Xmx512m` to `-Xms1g -Xmx1g` (per risk-scorer R1, pre-empts 2.19 startup-OOM noise; matches local-dev posture).

**Why no changeset**: `start:open-search` is a repo-only dev-convenience script; not part of the published `@mountainpass/addressr` package surface. Self-hosters use `npm install -g`, not `npm run start:open-search`.

**Tradeoff acknowledged**: CI build time roughly doubles during the Phase 1 window (matrix runs both legs in parallel; G-NAF + npm caches shared across legs via `actions/cache@v4` keys, so downloads are not duplicated). Doubled cost ends at step 9 decommission.

**ADR 029 amendments** (in-place, still `proposed`):

- Step 1 wording: matrix not replacement
- Step 6 wording: both legs must be green for cutover
- Step 9 wording: 1.3.20 leg cleanup spelled out (release.yml matrix entry, `:1.3.20` scripts, `SEARCH_IMAGE_1_3_20` config)
- New Bad consequence: doubled CI runtime during Phase 1 window
- Two new Confirmation criteria: matrix-state mechanically checkable during Phase 1 and after step 9

Architect re-review PASS, JTBD re-review PASS, risk-scorer plan review PASS with R1 (heap pre-emption) folded in. P028 status unchanged (still Known Error); closure still gated on cutover verification per ADR 029.

**Next action (user-led, unchanged)**: ADR 029 Phase 1 step 2 — run Cucumber suite + ADR 025 14-query SSLA baseline locally against 2.19 (via `npm run start:open-search:2.19` then the test runner). Address any version-upgrade regressions before progressing to step 4 (`terraform apply`).

#### Phase 1 step 2 complete + test:geo brought into CI scope (2026-04-27)

**Phase 1 step 2 (local validation against 2.19.5) is GREEN.** Confirmed twice:

1. CI's `build-and-test (2.19.5)` matrix leg passed in 2m18s on commit `98583ff` — runs `npm run test:nogeo` (5 cucumber profiles + node test:js).
2. Local `npm run test:nogeo` against `opensearchproject/opensearch:2.19.5` exit 0 — independent confirmation on macOS.

P027 (synonym + `AUTO:5,8` fuzziness) was not gating per the amended step 3 wording, but the cucumber pass implies it is not a 2.19-specific show-stopper either.

**test:geo brought into CI scope** (this commit). Production EB env at `deploy/main.tf:62-66` runs `ADDRESSR_ENABLE_GEO=1`; CI was previously running only `test:nogeo`, so the geo code path (`loadSiteGeo` / `loadDefaultGeo` in `service/address-service.js:1431` and `@geo`-tagged scenarios per `cucumber.js:10`) had no automated coverage. Closing that blind spot:

- `.github/workflows/release.yml` `build-and-test` job: existing "Run tests" step renamed to "Run tests (no geo)"; new "Run tests (geo)" step added, running `npm run test:geo` (3 cucumber profiles: `test:nodejs:geo`, `test:rest:geo`, `test:cli:geo`). Both steps run under the existing matrix (1.3.20 + 2.19.5).
- ADR 029 Phase 1 step 2 wording explicitly requires both `test:nogeo` and `test:geo` against 2.19; Confirmation section updated to mirror.
- Local verification before push: `npm run test:geo` against local 2.19.5 exit 0 (3 profiles, all passed).

**Trade-off**: per-matrix-leg CI runtime roughly doubles (~2m → ~4m); total matrix CI time across both versions roughly doubles for the duration of the parallel-domain window. Closes a production-parity coverage gap that pre-dated this work; the runtime cost is the right trade. No external API surface added — geo data comes from the G-NAF dataset itself.

**Phase 1 step 3 (gate) is clear**. Both no-geo AND geo cucumber green on 2.19.5 locally; CI will green on the next push. AWS spend (step 4 `terraform apply`) is unblocked.

## Related

- [ADR 029 — Two-phase blue/green upgrade off OpenSearch 1.3.20](../decisions/029-opensearch-blue-green-two-phase-upgrade.proposed.md) — **proposed 2026-04-21.** The fix plan for this problem. Phase 1 (1.3.20 → 2.19 via blue/green) is imminent; Phase 2 (2.19 → 3.x) is deferred. Amends ADR 021 on the version axis.
- [ADR 030 — OpenSearch domain under Terraform](../decisions/030-opensearch-domain-terraform-module.proposed.md) — **proposed 2026-04-21.** Sibling decision; brings the AWS-managed domain under IaC via a new `deploy/modules/opensearch/` module. ADR 029 Phase 1 depends on ADR 030's module being applied at least once.
- [ADR 021 — Retain OpenSearch, plan multi-backend](../decisions/021-retain-opensearch-plan-multi-backend.proposed.md) — flagged 1.3.x EOL as a reassessment trigger. P028 is the operational capture of that trigger being active. ADR 029 amends ADR 021 on the version axis; ADR 021's retain-OpenSearch and multi-backend directions are preserved.
- [ADR 002 — OpenSearch as search engine](../decisions/002-opensearch-as-search-engine.accepted.md) — version-agnostic; OpenSearch remains the engine. An upgrade does not contradict ADR 002. ADR 002's Confirmation section will be updated at ADR 029 Phase 1 cutover to reflect 2.19.
- [Problem P027 — Synonym expansion bypasses AUTO:5,8 fuzziness](./027-synonym-expansion-bypasses-auto-fuzziness.open.md) — candidate bug whose fix may be an upgrade. Related but independent of P028.
- [Problem P025 — GitHub Actions Node.js 20 deprecation](./025-github-actions-node20-deprecation.open.md) — adjacent version-debt ticket on a different axis (CI runtime). Similar pattern: managed-platform deprecation schedule forces our hand.
- [`package.json`](../../package.json) — `SEARCH_IMAGE: "opensearchproject/opensearch:1.3.20"` and `@opensearch-project/opensearch: ^3.5.1`.
- [`client/elasticsearch.js`](../../client/elasticsearch.js) — addressr's connection + index mapping code; will need review under 2.x for any DSL or mapping changes.
