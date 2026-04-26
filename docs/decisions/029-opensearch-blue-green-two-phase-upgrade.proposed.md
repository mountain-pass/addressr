---
status: 'proposed'
date: 2026-04-21
decision-makers: [Tom Howard]
consulted: []
informed: []
reassessment-date: 2026-07-21
---

# ADR 029: Two-phase blue/green upgrade off OpenSearch 1.3.20

## Context and Problem Statement

addressr's production search backend runs on an AWS-managed OpenSearch Service domain at engine family 1.3.x (local and CI pinned to 1.3.20 via the `opensearchproject/opensearch:1.3.20` Docker image; client `@opensearch-project/opensearch@^3.5.1`). Upstream OpenSearch 1.x reached **end of maintenance on 2025-05-06** per [endoflife.date/opensearch](https://endoflife.date/opensearch) — 11 months ago as of this ADR. No further upstream security patches or bug fixes will ship for 1.x. AWS has not yet announced Standard/Extended Support dates for OpenSearch **1.3** on its managed service (per the [AWS Big Data Blog, Nov 2024](https://aws.amazon.com/blogs/big-data/amazon-opensearch-service-announces-standard-and-extended-support-dates-for-elasticsearch-and-opensearch-versions/)), but AWS-managed 1.0–1.2 are already dated (Standard Support end 2025-11-07, Extended Support end 2026-11-07), establishing the pattern. When AWS publishes 1.3 dates we face a hard deadline, not advisory pressure.

Problem [P028](../problems/028-opensearch-1-3-20-version-debt.known-error.md) captures the full risk exposure: stranded query DSL features (`combined_fields`, `knn`/vector search, `point_in_time`), performance gaps, increasing distance from client library 3.5.1's spec direction, and design drag on ranking work (ADRs 025–028). The upgrade case is independent of any single defect — P027 (synonym expansion bypassing `AUTO:5,8` fuzziness in `match_bool_prefix`) is one candidate the upgrade may resolve, but the upgrade stands alone.

[ADR 021](021-retain-opensearch-plan-multi-backend.proposed.md) (2026-04-13, Retain OpenSearch, plan multi-backend) flagged 1.3.x EOL as a reassessment trigger for the retain-OpenSearch posture; that trigger has now fired. This ADR **amends** ADR 021 on the version axis (we retain OpenSearch, but not 1.x) — it does not supersede ADR 021; the retain-OpenSearch outcome and the multi-backend direction are preserved.

**Hard constraint**: the upgrade must be **zero-outage**. RapidAPI consumers and the AWS-hosted production API must see continuous availability throughout — including during cutover and any rollback.

## Decision Drivers

- Escape OpenSearch 1.x EOL before AWS publishes a forced-migration deadline — serves **J7 (Ship releases reliably from trunk)** by eliminating a compounding source of release-pipeline risk
- Zero production outage during the upgrade, including on the rollback path — protects **J1 (Search and autocomplete)**, **J2 (Look up localities/postcodes/states)**, **J3 (Validate against G-NAF)**, **J4 (Geocode)**, and **J5 (Normalize messy address data)** for end-user personas during cutover
- Preserve search quality — the 14-query symmetric-SSLA baseline ([ADR 025](025-search-ranking-symmetric-ssla.accepted.md)) and full Cucumber suite must pass against the new engine before traffic cuts over (direct protection of J1/J3's "confidence score" and "first-page correctness" outcomes)
- Instant rollback if the new engine regresses behaviour in production
- Keep per-hop behavioural diff bounded — 1.3 → 3.x in one step doubles the regression surface
- Co-investigate with P027, which may have a clean fix on 2.x
- Reusable pattern for future upgrades (don't build bespoke one-off tooling)

## Considered Options

1. **Stay on 1.3.20** — continue accepting the version debt
2. **In-place engine upgrade 1.3 → 2.19 via AWS console/API** — single domain, AWS handles snapshot/restore
3. **Blue/green single-jump to 2.19** — provision new domain, reindex from G-NAF, cut over, decommission old
4. **Blue/green single-jump to 3.x (3.5)** — as above, landing on the latest supported major
5. **Two-phase blue/green 1.3.20 → 2.19 → 3.x** — two blue/green cutovers, smaller regression surface per hop

Plus a sub-decision inside the chosen option — **how to populate the new domain's index**:

- **5a. Reindex from G-NAF source (chosen)** — loader rebuild against the new domain. Clean mappings, fresh analyzer pipeline, no carried-forward deprecations, but compute-heavy.
- **5b. Snapshot/restore from the 1.3.20 domain** — restore an S3 snapshot taken on 1.3.20 onto the 2.19 domain. Faster to populate, but carries forward 1.3-era mappings and analyzer settings; any deprecated 1.x feature in the snapshot becomes a 2.x failure mode. Engine-major snapshot restore across 1.x → 2.x is supported by OpenSearch but narrows our compatibility window.
- **5c. Dual-write during a bridge period** — application writes to both domains while the new one warms. Not viable here because our "writes" are a bulk G-NAF load, not trickling user writes — dual-write has no advantage over reindex for this workload.

## Decision Outcome

Chosen option: **Option 5 — Two-phase blue/green upgrade (1.3.20 → 2.19 → 3.x), with Phase 1 population via full reindex from G-NAF source (sub-option 5a)**.

Reasoning: Option 5 is the only option that satisfies the zero-outage constraint _and_ keeps each hop's behavioural surface bounded. Reindex-from-G-NAF is chosen over snapshot/restore because we do not want 1.3-era analyzer or mapping artefacts silently carried onto 2.x where they may interact differently with the query DSL — a clean rebuild forces any mapping incompatibility to surface pre-cutover during local Cucumber + baseline validation, not post-cutover as a slow regression. The G-NAF loader already runs as a repeatable process, so the compute cost is bounded and already understood.

### Phase 1 (imminent): 1.3.20 → 2.19 via blue/green

> **Phase 1 step order revised 2026-04-24** to defer AWS spend until local validation passes. The decision outcome (two-phase blue/green, 2.19 first, reindex-from-G-NAF, zero-outage) is unchanged; only the sequencing inside Phase 1 changed. Earlier commits under this ADR (module scaffolded in `deploy/modules/opensearch/`, module wired in `deploy/main.tf`) are order-neutral and remain valid.

1. **Add 2.19 to local + CI alongside 1.3.20** (do NOT remove 1.3.20 yet). Rollback safety during the parallel-domain window (steps 4–9) requires the same app binary to work against both versions, because cutover (step 7) is a single-variable `ELASTIC_HOST` flip and rollback flips it back. **Implementation**: in `package.json`, keep the existing 1.3.20 entry as `SEARCH_IMAGE_1_3_20`, add a `SEARCH_IMAGE_2_19` entry, and flip the default `SEARCH_IMAGE` (used by the convenience `start:open-search` / `pull:open-search` scripts) to 2.19; add explicit `start:open-search:1.3.20`, `start:open-search:2.19`, `pull:open-search:1.3.20`, `pull:open-search:2.19` scripts. In `.github/workflows/release.yml`, add `strategy.matrix.opensearch_version: ["1.3.20", "2.19.5"]` (using the latest available `2.19.x` patch — the OpenSearch project does not publish a moving `2.19` Docker tag, so a specific patch is required) to the `build-and-test` job and template `services.opensearch.image` off the matrix value; set `fail-fast: false` so one leg's red does not cancel the other; raise `services.opensearch.env.ES_JAVA_OPTS` from `-Xms512m -Xmx512m` to `-Xms1g -Xmx1g` to match the local-dev posture (2.x baseline is heavier; pre-empts startup-OOM noise on the 2.19 leg). Verify `@opensearch-project/opensearch@^3.5.1` client compatibility against 2.19 (client matrix confirms 2.x support; no pin change expected — document if any). A CI-red on the service-container health check is the desired fail-fast surface for genuine client/engine incompatibility and is the whole point of doing this step first.
2. **Run local validation against 2.19**. Cucumber suite — **both `npm run test:nogeo` AND `npm run test:geo` scopes** — against local `opensearchproject/opensearch:2.19.x`, plus the ADR 025 14-query symmetric-SSLA baseline. The geo scope matches the production EB env (`ADDRESSR_ENABLE_GEO=1` at `deploy/main.tf`); skipping it would leave a coverage blind spot on the actual production code path. This step also feeds the P027 (synonym-expansion bypassing `AUTO:5,8` fuzziness) co-investigation.
3. **Gate**: if any **version-upgrade regression** is observed in step 2, address it before proceeding. No AWS spend begins until this gate is green. The gate blocks on version-upgrade regressions only — **P027 is co-investigated, not gating**: if P027's behaviour is preserved or changed on 2.19, that is data for a separate P027 decision and does not block Phase 1.
4. **Stand up the v2 domain**. `terraform apply` to provision a new AWS-managed OpenSearch domain at engine version 2.19 (`search-addressr4-…`). The domain is **provisioned via Terraform** per [ADR 030](030-opensearch-domain-terraform-module.proposed.md) — the ADR 029 upgrade is the forcing function for bringing the OpenSearch resource under IaC, but ADR 030 stands on its own merits (see ADR 030's Context). AWS spend for the parallel domain begins here, only after step 3 is green. Phase 1 cannot proceed to cutover (step 7) until the ADR 030 module has been **applied to real infra at least once** (module merge alone is insufficient); that constraint is satisfied by the act of completing step 4 itself.
5. **Populate the v2 domain**. Run the G-NAF loader against `search-addressr4-…` to rebuild the index from source while `search-addressr3-…` continues to serve production unchanged.
6. **Re-run validation against the AWS-managed v2 domain**. Cucumber suite + 14-query symmetric-SSLA baseline against `search-addressr4-…`. This catches AWS-managed-specific deltas (IAM/access-policy, TLS, instance class, data-node count) that local Docker cannot surface. Block cutover on any behavioural regression on **either** matrix leg — both 1.3.20 and 2.19 must be green so rollback retains zero-outage guarantees.
7. **Cutover**. Update the `ELASTIC_HOST` Terraform variable to point at `search-addressr4-…` (sourced from `module.opensearch_v2.endpoint`) and deploy the EB app. Both domains remain warm; only the application layer points at 2.19. The variable name `ELASTIC_HOST` is retained (rename to `SEARCH_HOST` is out of scope for this ADR — deferred deliberately to avoid bundling a rename with a cutover).
8. **Post-cutover smoke and rollback window**. Run the existing smoke-test suite against the production API immediately after deploy. On failure, revert the `ELASTIC_HOST` variable and re-run `terraform apply` — rollback is bounded by EB env-var propagation plus an ASG rolling replace (single-digit minutes), not instant in the strict sense. `search-addressr3-…` is untouched throughout, so the rollback path has no data-migration risk.
9. **Soak and decommission**. After a **soak of at least 7 days in production with no regressions**, decommission `search-addressr3-…`. **As part of decommission**, remove the 1.3.20 leg from `release.yml`'s matrix, drop the `start:open-search:1.3.20` and `pull:open-search:1.3.20` scripts from `package.json`, and remove the `config.SEARCH_IMAGE_1_3_20` entry. After this point, `package.json` carries 2.19 only and CI tests 2.19 only.
10. **Update downstream ADRs**. Update [ADR 002](002-opensearch-as-search-engine.accepted.md)'s Confirmation section to reflect the 2.19 engine and updated `SEARCH_IMAGE` pin. Add a note to ADR 021's Reassessment Criteria that the "OpenSearch 1.3.x EOL forces an upgrade decision" trigger is resolved by this ADR; leave ADR 021's status unchanged. Promote ADR 029 and ADR 030 to `accepted`.

### Phase 2 (deferred): 2.19 → latest 3.x

Repeat the same blue/green pattern, landing on AWS's latest supported 3.x (3.5 at time of writing). Phase 2 is explicitly deferred to a separate implementation story; this ADR commits only to the pattern, not the date. Phase 2 is triggered by whichever comes first: AWS publishing 2.x Standard Support end-dates that intrude on our horizon, or product demand for a 3.x-only feature (notably `knn`/vector for semantic address search).

## Consequences

### Good

- Zero-outage upgrade path consistent with the user-mandated constraint — protects J1/J2/J3/J4/J5 for end users throughout cutover
- Bounded rollback window (single-digit minutes via Terraform variable flip) because `search-addressr3-…` is untouched during Phase 1
- Per-phase regression surface is bounded (one major per hop, not two)
- Clean index rebuild from G-NAF source surfaces mapping/analyzer incompatibilities pre-cutover during local validation, not post-cutover in production
- Local 2.19 spike unblocks the P027 co-investigation and the CI `SEARCH_IMAGE` bump keeps CI and production aligned on engine family
- Leaves the Phase 2 → 3.x decision open so we can land 3.x with `knn`/vector search as a distinct product decision rather than forced infrastructure work
- Serves **J7 (Ship releases reliably from trunk)** by bringing the engine back under supported-software guarantees

### Neutral

- Two upgrade events over time instead of one — more calendar work, but each event is smaller
- `search-addressr3-…` survives through the 7-day soak, so AWS costs for the search tier temporarily double during Phase 1 cutover
- CI builds against 2.19 slightly change the loader's runtime profile; CI timings should be re-baselined post-bump
- `ELASTIC_HOST` variable name is deliberately retained despite the engine no longer being Elasticsearch — avoids bundling a rename with a cutover. A future cosmetic-rename story can address this.

### Bad

- AWS cost double-up during the soak is a real line-item increase (managed OpenSearch is already the largest single AWS bill item per ADR 021). Mitigation: run Phase 1 overlap for the minimum viable soak and match `search-addressr4-…`'s instance class to `search-addressr3-…`'s.
- G-NAF load against a fresh domain consumes full-dataset compute time and must be scheduled outside peak traffic windows.
- Residual risk to J1/J3: a subtle scoring or ranking delta could slip past the 14-query baseline and land in production. The 7-day soak is the compensating control; monitor P027-style feedback during soak.
- Phase 2 is deferred, so version debt accumulates on the 2.x axis until Phase 2 is executed. Acceptable because the AWS support window for 2.x is multi-year and not imminent.
- Phase 1 cutover is blocked on ADR 030's module being applied to real infra at least once — coupling introduces a sequencing constraint that must be tracked explicitly in the implementation story. Under the 2026-04-24 step reorder, the apply itself is step 4 of Phase 1 (preceded by local validation), so the constraint is satisfied by completing step 4 rather than by a separate pre-Phase-1 action.
- CI build time roughly doubles during the Phase 1 parallel-domain window because the `build-and-test` job's matrix runs both 1.3.20 and 2.19 legs. Mitigated by `actions/cache@v4` for the G-NAF zip and the npm cache (cache keys do not include the matrix variable, so legs share the cache and the G-NAF download is not duplicated). The doubled cost ends at step 9 when the 1.3.20 leg is removed.

## Confirmation

- [ADR 030](030-opensearch-domain-terraform-module.proposed.md) is `proposed` and its module (`deploy/modules/opensearch/`) is implemented and applied to real infra before any `ELASTIC_HOST` change in `deploy/main.tf`. Both ADRs promote to `accepted` together after the 7-day soak completes successfully.
- Before production cutover, the 14-query symmetric-SSLA baseline ([ADR 025](025-search-ranking-symmetric-ssla.accepted.md)) and the **full Cucumber suite — both `test:nogeo` and `test:geo` scopes** — pass against both local 2.19 and `search-addressr4-…`. The geo scope matches the production `ADDRESSR_ENABLE_GEO=1` posture; both scopes must be green for cutover. Deltas, if any, are documented in the implementation story.
- Before cutover, `package.json`'s `SEARCH_IMAGE` is updated to an `opensearchproject/opensearch:2.19.x` tag and CI passes against the bumped image. Client pin `@opensearch-project/opensearch@^3.5.1` is verified against 2.19 (no pin change expected; document if any).
- After cutover, the smoke-test suite passes against the production API within 5 minutes of deployment. Rollback verified to complete within 10 minutes end-to-end (`terraform apply` + EB env-var propagation + ASG rolling replace).
- `search-addressr3-…` is not destroyed until the 7-day soak completes with no reverts.
- On ADR 029 Phase 1 completion: ADR 002's Confirmation section is updated to reflect 2.19, and ADR 021's Reassessment Criteria gains a note that the 1.3.x-EOL trigger is resolved. ADR 021's status is not changed.
- Problem P028 transitions to Known Error on acceptance of this ADR (root cause and fix strategy now documented) and to Closed only when Phase 1 cutover is verified in production.
- During Phase 1 (between step 1 and step 9), `.github/workflows/release.yml` `build-and-test` job has `strategy.matrix.opensearch_version` containing **both** `"1.3.20"` and the chosen `2.19.x` patch (currently `"2.19.5"`), and `package.json` `config` carries both `SEARCH_IMAGE_1_3_20` and `SEARCH_IMAGE_2_19` entries (the latter holding the same chosen 2.19.x tag).
- After Phase 1 step 9 (decommission), `release.yml` matrix contains only `"2.19"` (or its patch successor) and `package.json` carries only `SEARCH_IMAGE_2_19`. The `start:open-search:1.3.20` and `pull:open-search:1.3.20` scripts are removed in the same commit that performs the decommission.

## Pros and Cons of the Options

### Option 1: Stay on 1.3.20

- Good: No work now
- Bad: Fails P028's fix strategy
- Bad: Forced migration becomes more painful the longer we defer; AWS timing risk remains open

### Option 2: In-place engine upgrade via AWS

- Good: Simpler ops — AWS handles snapshot/restore
- Good: No cost double-up during soak
- Bad: Rollback requires snapshot restore (tens of minutes to hours) — fails the zero-outage constraint on the failure path
- Bad: If upgrade fails mid-way, the primary domain is in a degraded state
- Bad: No opportunity to surface mapping/analyzer incompatibilities pre-cutover — 1.x artefacts carry forward

### Option 3: Blue/green single-jump to 2.19

- Good: Zero-outage, bounded rollback (satisfies the constraint)
- Good: Clean reindex surfaces incompatibilities pre-cutover
- Bad: Leaves us on 2.x with Phase 2 still required — same end state as Option 5 with one fewer checkpoint
- Bad: No natural decision boundary for deferring further upgrade work

### Option 4: Blue/green single-jump to 3.x

- Good: Lands on the latest major in one cutover; maximum distance from EOL
- Good: Single soak period instead of two
- Bad: 1.3 → 3.x behavioural diff doubles the regression surface; higher test load
- Bad: More likely to surface query-builder or analyzer changes that break our pipeline in a single hop
- Bad: Client 3.5.1 against server 3.5 is less exercised territory for our specific query shapes

### Option 5: Two-phase blue/green (chosen)

- Good: All of Option 3's zero-outage and clean-reindex benefits
- Good: Per-hop regression surface is bounded (one major per hop)
- Good: Phase boundary is a natural decision point — Phase 2 can be re-prioritised against other work
- Bad: Two operational events over time (but each smaller)
- Bad: Brief AWS-cost double-up per phase during soak

### Sub-option 5a: Reindex from G-NAF source (chosen)

- Good: Clean mappings and analyzer pipeline on 2.x
- Good: Incompatibilities surface pre-cutover during local validation
- Good: Uses the already-understood G-NAF loader path
- Bad: Compute-heavy; adds to Phase 1 elapsed time

### Sub-option 5b: Snapshot/restore from 1.3.20

- Good: Faster to populate the new domain
- Bad: Carries 1.x-era mapping/analyzer artefacts forward
- Bad: Deprecation surprises appear post-cutover rather than pre-cutover
- Bad: Narrows compatibility window for future reassessment

### Sub-option 5c: Dual-write bridge

- No advantage for this workload — our "writes" are bulk G-NAF loads, not user traffic

## Reassessment Criteria

- Phase 1 cutover ships and the 7-day soak passes → file a Phase 2 follow-up problem ticket and close the Phase 1 half of P028
- Phase 1 cutover regresses and reverts → reassess whether to retry on 2.17 (an older 2.x AWS supports) or reopen ADR 021's multi-backend direction
- AWS publishes OpenSearch 1.3 Standard/Extended Support end dates that intrude on the Phase 1 schedule → tighten Phase 1's deadline accordingly
- Client library `@opensearch-project/opensearch` publishes a dated deprecation for 1.x-server support that lands before Phase 1 cutover → treat as an additional Phase 1 trigger
- Before 2026-07-21 or on any of the above triggers, whichever comes first

## Related

- [ADR 002 — OpenSearch as search engine](002-opensearch-as-search-engine.accepted.md) — engine choice; version-agnostic. ADR 002's Confirmation section will be updated at Phase 1 cutover to reflect 2.19.
- [ADR 004 — AWS Elastic Beanstalk deployment](004-aws-elastic-beanstalk-deployment.accepted.md) — the EB app is the point of cutover.
- [ADR 021 — Retain OpenSearch, plan multi-backend](021-retain-opensearch-plan-multi-backend.proposed.md) — amended by this ADR on the version axis. The retain-OpenSearch outcome and multi-backend direction are preserved.
- [ADR 025 — Search ranking symmetric SSLA](025-search-ranking-symmetric-ssla.accepted.md) — the 14-query baseline whose green-side run gates cutover.
- [ADR 030 — OpenSearch domain under Terraform](030-opensearch-domain-terraform-module.proposed.md) — sibling decision; provides the provisioning mechanism Phase 1 depends on.
- [Problem P028 — OpenSearch 1.3.20 version debt](../problems/028-opensearch-1-3-20-version-debt.known-error.md) — the forcing function for this ADR.
- [Problem P027 — Synonym expansion bypasses AUTO:5,8 fuzziness](../problems/027-synonym-expansion-bypasses-auto-fuzziness.open.md) — co-investigated in Phase 1 step 4; may close on 2.19.
- [`docs/JOBS_TO_BE_DONE.md`](../JOBS_TO_BE_DONE.md) — J7 (maintainer release integrity), J1–J5 (end-user functional jobs).
