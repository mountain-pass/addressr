# OpenSearch blue/green migration playbook

> **Derived summary — the ADRs are authoritative.** This distills the completed 1.3.20 → 2.19 migration into a reusable checklist. Where it and an ADR disagree, the ADR wins. **Reuse this for Phase 2 (2.19 → 3.x)** and any future search-backend move.

The pattern is zero-outage blue/green + read-shadow warming + measured parity gate + auto-rollback cutover. The capability code (`src/read-shadow.js`, `src/es-health.js`, `src/es-auth.js`, `client/elasticsearch.js` SigV4 branch) is already shipped and default-off, so Phase 2 is mostly config + measurement, not new code.

Governing decisions: **ADR 029** (two-phase blue/green), **ADR 030** (Terraform-managed domain), **ADR 031** (read-shadow), **ADR 033** (IAM/SigV4 auth, FGAC off) — all ratified + shipped. **ADR 034** (GHA-OIDC quarterly refresh) is **PROVISIONAL / in-flight** (captured skeleton, `human-oversight: unconfirmed`, not yet built — see `scratchpad/v2-reautomate-and-decommission-runbook.md`); ratify + expand it before relying on its specifics.

## The sequence (each step gated; nothing proceeds until the prior verifies)

1. **Provision the target domain QUIET** via the `./modules/opensearch` Terraform module (ADR 030) — FGAC OFF, IAM/SigV4 (ADR 033), no shadow traffic yet. Provision at the instance class you _expect_ (see §Sizing) but be ready to resize — resize is safe now (FGAC-off removed the P036 clobber; 4 clean resizes in Phase 1).
2. **Load the full G-NAF dataset from scratch** with `number_of_replicas: 0` (index template) + headroom EBS, then set `replicas=1` and let it rebuild to green (see §Loading). Load locally with SigV4 (ADR 033).
3. **Validate**: doc count matches, cluster green, sample searches correct, geo present.
4. **Enable read-shadow** (ADR 031) — re-add the 5 `ADDRESSR_SHADOW_*` EB settings in `deploy/main.tf` pointing at the new domain with `ADDRESSR_SHADOW_AUTH_MODE=sigv4`; flip the `release.yml` smoke `hostSet` assertion false→true. This mirrors live production search to the new domain to warm its caches. Verify `/debug/shadow-config` shows `successes>0, failures=0` (2xx) before starting the soak clock.

   > **This verification is yours to run by hand — CI does not do it for you.** The release smoke gate asserts only the _shape_ of `/debug/shadow-config`, never `successes>0` / `failures==0`, and it accepts `lastError.class=AuthError` as passing. The 2026-05-11 regression that ran at a 96.5% AuthError rate for eight days would have passed it green. Re-check the counters yourself throughout the soak, not just at the start — they are cumulative-since-boot, so a healthy opening window keeps a later break looking survivable. See P035 (`docs/problems/known-error/035-shadow-soak-validation-blind-spots.md`, BS-1 and BS-5) for the full blind-spot inventory and the fix that would replace this paragraph with an assertion.

5. **Soak + measure PARITY** — let the shadow warm the new domain, then compare `SearchLatency` (CloudWatch, both domains) and run the k6 pair. **Gate: new-domain warm search p95 ≤ 1.5× a baseline measured immediately before THIS cutover.** The 1.5× multiplier is normative; the absolute number is not, and must be re-derived every time. Do not reuse the historical ~1443 ms figure — it descends from a retired 961 ms baseline, carries several times the slack against anything measured since, and therefore could not fail. ADR-031 criterion 5 retires it explicitly. Compare `SearchLatency` as a target/primary **ratio** per bucket rather than the target's absolute p90: absolute latency tracks query volume, so a diurnal trough makes a cold target look fast (ADR-031 criterion 3, corrected 2026-08-01). Also run the SSLA-14 ranking check + the full nodejs Cucumber suite AGAINST the real new domain (point `ELASTIC_HOST` at it + SigV4).
6. **Confirm the zero-outage safety net is live**: `/health` pings the backend (`src/es-health.js`) so a bad cutover fails EB's health-gated rollout → `RollbackLaunchOnFailure`. (Built in Phase 1; carries forward.)
7. **Cutover** — flip the EB primary `ELASTIC_*` to the new domain (see §Cutover-config), one atomic commit; EB rolling deploy + `/health` gate + post-deploy smoke. Rollback = flip the ONE `ELASTIC_HOST` line back + apply, NOT git-revert of the cutover commit (a cutover commit typically bundles several changes; reverting it re-enables the read-shadow and re-arms retired alarms — corrected 2026-08-02). Measured at 6m36s. Old domain untouched + warm).
8. **Explicitly repoint every WRITER** — the serving cutover does NOT carry them (see §Repoint-writers).

> **RETENTION GATE — the old domain may NOT be deleted until BOTH hold** (set 2026-08-02, treatment for the warm-standby risk; see P079):
>
> 1. the new primary has served **at least a quarter of its average daily request volume** since cutover, and
> 2. the searchable-documents alarm has not fired.
>
> Expressed as a fraction of average daily traffic, never as an absolute request count — absolute request and read counts are confidential traffic volumes under RISK-POLICY and this repo is public. Commit the fraction and the go/no-go, never the underlying figures. Baseline the denominator on the primary's representative pre-cutover traffic, excluding idle days; the cutover day itself reads near-zero on the OLD domain and will poison a naive average.
>
> Why a fraction of traffic rather than a number of days: it self-extends over a quiet period, where a calendar date would expire having proved nothing. Why so short: rollback remedies fast-surfacing failures (unreachable domain, wrong analyzer, empty index), which are invariant to time of day and appear within the first thousands of requests. It does not remedy slow-surfacing relevance regressions — those get fixed forward, never by unwinding a months-old cutover.
>
> **The window is short BECAUSE of the read-shadow soak.** The two are substitutes, not complements: the soak runs real production traffic against the new domain before any user depends on it, front-loading the evidence a long retention window would otherwise accumulate. If you ever cut over WITHOUT a comparable soak, this fraction is too small — size it up rather than copying it.
>
> Proving the rollback MECHANISM is a separate, one-off matter and is already done: exercised and timed 2026-08-02 at 6m36s (ADR-029 Confirmation). Do not re-run a drill per migration.

9. **Soak in production**, then **decommission the old domain via TERRAFORM — never `aws opensearch delete-domain`** (corrected 2026-08-03: since ADR 030 brought domains under Terraform, an out-of-band CLI delete leaves state holding a phantom resource and the NEXT apply recreates the domain). Remove the module block, its EB IAM policy, the loader role + policy + output, the alarm and the vars in one commit, then apply. Stage it as TWO applies: first sever the EB instance role's grant and drop it from the domain's access policy, verify production unaffected; then destroy the rest with a plan asserting zero change to `aws_elastic_beanstalk_environment`. Note apply 1 is the point of no return — it retires the one-line rollback, so a deliberate rollback between applies costs an IAM re-apply first. Then cleanup (drop the old-version CI matrix leg + `package.json` image entry; remove dangling vars/dashboard refs) + promote the ADRs to accepted.

   **Clear the retired domain's GitHub Actions secret** (`gh secret delete TF_VAR_ELASTIC_V<n>_HOST`). Terraform does not own it, so removing the module leaves it behind pointing at a destroyed domain. It survived the 2026-08-02 decommission and was only caught the next day off the ADR 029 precedent. Do it AFTER the workflow references are gone and verified absent (`grep -rn ELASTIC_V<n>_HOST .github/ deploy/` returns nothing) — the callee declaration and the pass-through from all nine `update-{state}.yml` crons must move in the same commit or every loader breaks, and the break is silent until a quarterly cron fires. `test/js/__tests__/loader-workflow.test.mjs` pins that contract and runs in CI.

## Hard-won learnings (the expensive ones)

### Sizing is EMPIRICAL — measure warm parity on the target class; do NOT reuse the 2.19 number

Phase 1's biggest trap: t3.small serves 1.3.20 fine, so it _looked_ adequate — but 2.19 is a heavier engine and t3.small **diverged from v1 under load** (p90 climbed to ~2.7s and rising vs v1's ~200ms). Diagnosis via CloudWatch: v2 CPU/JVM were _lower_ than v1 → **I/O-bound (page-cache misses), not compute-bound**. The 2GB box couldn't hold the ~1.7×-larger 2.19 index hot-set. m6g.large (8GB) matched and beat v1 (warm p90 45ms). **The `m6g.large.search × 2` result is a 2.19-specific measurement, NOT a transferable constant — 3.x has its own index size, heap profile, and per-doc disk footprint.** For Phase 2: re-run the small-vs-candidate warm-parity measurement on the 3.x engine and re-decide the instance class on THAT number (ADR-074 — don't cement an unmeasured choice). ADR 031 even flags 2.19→3.x might have no cold-cache problem at all. The read-shadow soak is how you measure this cheaply, before any cutover.

### From-scratch bulk load needs replicas=0 + EBS headroom + the doc-count alarm armed FIRST

2.19 uses ~1.7× the disk-per-doc of 1.3.20; a from-scratch 16.9M-doc load node-dropped and **silently deleted the index (P035)** on t3.small×2/12GB. Load with `replicas=0` (halves disk + write pressure) + generous EBS, then add the replica post-load. **Arm the `SearchableDocuments`-drop CloudWatch alarm (floor near the expected count, NOT a low 1M) BEFORE loading** — it's the trip-wire for a silent index wipe. Re-check the disk multiplier for 3.x.

### Auth: FGAC OFF, IAM/SigV4 only (ADR 033)

FGAC's internal-user-DB got silently clobbered by an AWS-internal channel (P036) — invisible even to audit logs — twice. The fix was structural: disable `advanced_security_options` entirely, scope the domain `access_policies` to specific IAM principals (EB role + loader identity), authenticate via SigV4. No `.opendistro_security` index = nothing to clobber. **Provision the 3.x domain FGAC-off the same way.** The SigV4 client branch is already in `client/elasticsearch.js` / `src/es-auth.js` / `src/read-shadow.js`, gated by `ELASTIC_AUTH_MODE=sigv4`.

### A deploy-gating health check MUST exercise the dependency

A static `/health` (200 without touching the backend) makes zero-outage auto-rollback _theatre_ — a misconfigured cutover passes health and rolls out fleet-wide. `/health` now pings OpenSearch (`checkEsHealth`), 503 on unreachable → EB `RollbackLaunchOnFailure`. Kill-switch `HEALTH_ES_PROBE=off`; ~5s TTL cache bounds amplification. This is the linchpin of the zero-outage guarantee — keep it working across Phase 2.

### The serving cutover does NOT automatically carry the WRITE path (post-SigV4)

In ADR 029's _original_ design the write path rode along (the shared `TF_VAR_ELASTIC_HOST` secret repointed the loader too). **That coupling broke under ADR 033**: v2 is SigV4-only, the bulk load moved local, and the 9 quarterly `update-{state}.yml` crons kept writing v1 after the 2026-07-10 cutover — production read a domain that then silently froze. That gap is exactly why ADR 034 exists. **Lesson: the serving cutover repoints only the read path; the quarterly write path is a SEPARATE re-automation — enumerate every writer (loader crons, dashboards, alarms) and verify the new-domain write path works BEFORE decommissioning the old domain.**

### SigV4 primary config empties the basic-auth creds

`buildClientNode` (`src/client-node-url.js`) only omits embedded creds when username is empty. The cutover EB block sets `ELASTIC_HOST=module.opensearch_v2.endpoint`, `ELASTIC_AUTH_MODE=sigv4`, `ELASTIC_REGION=ap-southeast-2`, and **`ELASTIC_USERNAME=""` / `ELASTIC_PASSWORD=""`** — the credential-less node the signer wraps. Leaving basic creds set alongside sigv4 is untested.

### Check ADR ratification before building on it

ADR 030 slipped un-ratified (`human-oversight: confirmed` missing) and blocked the cutover mid-flight. Before building on an ADR, confirm its frontmatter marker; drain via `/wr-architect:review-decisions`.

## §Cutover-config (the exact EB primary flip)

See `deploy/main.tf` (the `ELASTIC_*` settings block, ~line 99) as landed for Phase 1 (commit `1b76c61`) — replicate for Phase 2 with the 3.x domain endpoint. `ELASTIC_PORT=443` / `ELASTIC_PROTOCOL=https` are unchanged (AWS domains). Rollback = set the single `ELASTIC_HOST` value back to the previous domain module's endpoint + apply. **NOT `git revert` of the cutover commit** — corrected 2026-08-02: a cutover commit bundles several changes (`33e6c04` carried five), so reverting it does more than flip the host. Exercised and measured 2026-08-02 at 6m36s push-to-EB-updated.

**Verify a flip with a query that has NEVER been requested.** Edge caching served stale responses for several minutes after the environment had already switched, in both directions. A canonical verification query will tell you the flip did not work when it did, which during an incident is the reading that makes you flip again. `/health` cannot discriminate either — it is a `ping()` that goes green against whichever domain is wired.

## §Repoint-writers

Loaders: `.github/workflows/reusable-update.yml` + the 9 `update-{state}.yml` crons. Post-ADR-033 the target=v2 write path needs SigV4 (the existing basic-auth branch is broken). ADR 034 (provisional) re-automates them on GHA via an OIDC-scoped IAM role. For 3.x, repoint the loader in the same cutover work — do not leave it writing the old domain.

## §Read-shadow re-enable for Phase 2

The read-shadow capability stays shipped default-off (ADR 031 enable/disable ledger). Re-enable by re-adding the `ADDRESSR_SHADOW_*` block (the 2026-07-08 Stage 3 commit is the template; the 2026-07-10 removal is the reverse). It measures 3.x parity the same way it measured 2.19.
