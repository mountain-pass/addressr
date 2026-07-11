# OpenSearch blue/green migration playbook

> **Derived summary — the ADRs are authoritative.** This distills the completed 1.3.20 → 2.19 migration into a reusable checklist. Where it and an ADR disagree, the ADR wins. **Reuse this for Phase 2 (2.19 → 3.x)** and any future search-backend move.

The pattern is zero-outage blue/green + read-shadow warming + measured parity gate + auto-rollback cutover. The capability code (`src/read-shadow.js`, `src/es-health.js`, `src/es-auth.js`, `client/elasticsearch.js` SigV4 branch) is already shipped and default-off, so Phase 2 is mostly config + measurement, not new code.

Governing decisions: **ADR 029** (two-phase blue/green), **ADR 030** (Terraform-managed domain), **ADR 031** (read-shadow), **ADR 033** (IAM/SigV4 auth, FGAC off) — all ratified + shipped. **ADR 034** (GHA-OIDC quarterly refresh) is **PROVISIONAL / in-flight** (captured skeleton, `human-oversight: unconfirmed`, not yet built — see `scratchpad/v2-reautomate-and-decommission-runbook.md`); ratify + expand it before relying on its specifics.

## The sequence (each step gated; nothing proceeds until the prior verifies)

1. **Provision the target domain QUIET** via the `./modules/opensearch` Terraform module (ADR 030) — FGAC OFF, IAM/SigV4 (ADR 033), no shadow traffic yet. Provision at the instance class you _expect_ (see §Sizing) but be ready to resize — resize is safe now (FGAC-off removed the P036 clobber; 4 clean resizes in Phase 1).
2. **Load the full G-NAF dataset from scratch** with `number_of_replicas: 0` (index template) + headroom EBS, then set `replicas=1` and let it rebuild to green (see §Loading). Load locally with SigV4 (ADR 033).
3. **Validate**: doc count matches, cluster green, sample searches correct, geo present.
4. **Enable read-shadow** (ADR 031) — re-add the 5 `ADDRESSR_SHADOW_*` EB settings in `deploy/main.tf` pointing at the new domain with `ADDRESSR_SHADOW_AUTH_MODE=sigv4`; flip the `release.yml` smoke `hostSet` assertion false→true. This mirrors live production search to the new domain to warm its caches. Verify `/debug/shadow-config` shows `successes>0, failures=0` (2xx) before starting the soak clock.
5. **Soak + measure PARITY** — let the shadow warm the new domain, then compare `SearchLatency` (CloudWatch, both domains) and run the k6 pair. **Gate: new-domain warm search p95 ≤ 1.5× current** (recompute the baseline for Phase 2 — Phase 1's was 961ms → ≤~1443ms). Also run the SSLA-14 ranking check + the full nodejs Cucumber suite AGAINST the real new domain (point `ELASTIC_HOST` at it + SigV4).
6. **Confirm the zero-outage safety net is live**: `/health` pings the backend (`src/es-health.js`) so a bad cutover fails EB's health-gated rollout → `RollbackLaunchOnFailure`. (Built in Phase 1; carries forward.)
7. **Cutover** — flip the EB primary `ELASTIC_*` to the new domain (see §Cutover-config), one atomic commit; EB rolling deploy + `/health` gate + post-deploy smoke. Rollback = git-revert + apply (old domain untouched + warm).
8. **Explicitly repoint every WRITER** — the serving cutover does NOT carry them (see §Repoint-writers).
9. **Soak in production**, then **decommission the old domain** (`aws opensearch delete-domain`), then cleanup (drop the old-version CI matrix leg + `package.json` image entry; remove dangling vars/dashboard refs) + promote the ADRs to accepted.

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

See `deploy/main.tf` (the `ELASTIC_*` settings block, ~line 99) as landed for Phase 1 (commit `1b76c61`) — replicate for Phase 2 with the 3.x domain endpoint. `ELASTIC_PORT=443` / `ELASTIC_PROTOCOL=https` are unchanged (AWS domains). Rollback = `git revert` the cutover commit + apply.

## §Repoint-writers

Loaders: `.github/workflows/reusable-update.yml` + the 9 `update-{state}.yml` crons. Post-ADR-033 the target=v2 write path needs SigV4 (the existing basic-auth branch is broken). ADR 034 (provisional) re-automates them on GHA via an OIDC-scoped IAM role. For 3.x, repoint the loader in the same cutover work — do not leave it writing the old domain.

## §Read-shadow re-enable for Phase 2

The read-shadow capability stays shipped default-off (ADR 031 enable/disable ledger). Re-enable by re-adding the `ADDRESSR_SHADOW_*` block (the 2026-07-08 Stage 3 commit is the template; the 2026-07-10 removal is the reverse). It measures 3.x parity the same way it measured 2.19.
