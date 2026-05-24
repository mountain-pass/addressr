# Problem 042: Version-control the Cloudflare Worker via Terraform

**Status**: Open
**Reported**: 2026-05-14
**Priority**: 3 (Medium) — Impact: 3 x Likelihood: 1 (deferred — re-rate at next /wr-itil:review-problems)
**Effort**: M (deferred — re-rate at next /wr-itil:review-problems)
**Type**: technical

## Description

Bring the Cloudflare Worker source described in ADR 018 (`cool-bush-ca66`, route bound to `api.addressr.io/*` and `cool-bush-ca66.addressr-key-provider.workers.dev`) into the repository as `worker.js` (or equivalent) and manage its deploy via the Cloudflare Terraform provider. Closes the "Bad" consequence at ADR 018 line 50 ("The worker is not version-controlled — it exists only in Cloudflare's platform") and the Reassessment Criterion at ADR 018 line 63 ("Version-controlling the worker script — currently only in Cloudflare dashboard").

Specifically:

1. Move the worker source into the repo with a proper CIDR-aware `safeIps` matcher (the P040 fix) so the existing IP allowlist behaves as intended for both IPv4 and IPv6 ranges.
2. Move the hardcoded RapidAPI key out of the worker script and into a Cloudflare Worker secret, populated via the Cloudflare Terraform provider. Extend the existing 1Password Voder → GitHub Actions secrets → Terraform secret flow (per the `reference_addressr_secrets` memory and ADR 024's Confirmation criterion 8) to cover this key. The current key in production is reused in place (the operator opted not to rotate during the P040 work session); the rotation event becomes a Terraform-managed secret-set rather than a dashboard edit when next required.
3. Add a CIDR-matcher unit test (the TDD red/green that P040 could not host because the source was not yet in the repo). The test imports the matcher and asserts that IPs inside the `69.162.124.224/28`, `216.144.248.16/28`, `216.245.221.80/28`, and `2607:ff68:107::0/121` ranges all match — these are the failing cases under the current strict-equality implementation.
4. Add a UR-IP-drift detection script (optional but recommended): diffs the worker's `safeIps` against UR's currently published lists at `https://uptimerobot.com/inc/files/ips/IPv4.txt` and `.../IPv6.txt`; opens a problem ticket when drift exceeds a threshold. Pre-empts the next P040 recurrence.

**Why Terraform, not Wrangler.** The repo already uses Terraform for AWS (Elastic Beanstalk, OpenSearch via ADR 030) with the 1P Voder → GH Actions → TF secret flow. Wrangler stores secrets in Cloudflare-only state and uses a different deploy model — adopting it would fork the secret-management spine. The Cloudflare Terraform provider keeps a single deploy story across AWS + Cloudflare. Trade-off: the provider's worker resources are less polished than wrangler's native CLI (lag on newer runtime features); for a simple key-injecting proxy this is acceptable. Local development of worker logic can still use `wrangler dev` later if a need arises — TF deploy and wrangler local-dev compose cleanly.

**Architect verdict on ADR shape (from the P040 work session)**: amend ADR 018 to record the worker is now version-controlled (closes line 50 "Bad" consequence, marks line 63 Reassessment Criterion resolved), AND add a new ADR for the choice of Cloudflare Terraform provider over wrangler (captures the secret-flow rationale, rejects wrangler with reasons). The amendment + new-ADR pair is the same shape used by ADR 029/030 (OpenSearch upgrade pattern + OpenSearch Terraform module).

## Symptoms

(deferred to investigation)

## Workaround

Until this lands, P040's Referer-header workaround (configure UR monitors to send `Referer: https://addressr.io/`) remains in effect, and ADR 016 Confirmation mandates the header. Worker code changes happen manually in the Cloudflare dashboard with no audit trail; key rotation requires manual dashboard editing.

## Impact Assessment

- **Who is affected**: Addressr Contributor/Maintainer (operator) persona. Customer-visible service is unaffected by the absence of this work; the impact is operational — manual worker edits, no PR review on auth boundary changes, fragile rotation path for the RapidAPI key, no way to test the matcher in CI.
- **Frequency**: Materialises every time someone touches the worker (rare today; expected to increase once option-2 patch lands and the matcher is in active maintenance).
- **Severity**: (deferred to investigation — the latent risk is "next P040-class incident with no fast rollback path")
- **Analytics**: ADR 018 line 49-50 "Bad" consequences; P040 RCA.

## Root Cause Analysis

### Investigation Tasks

- [ ] Re-rate Priority and Effort at next /wr-itil:review-problems
- [x] Draft the new ADR for "Cloudflare Worker deployed via Terraform (not wrangler)" — landed as ADR 032 (proposed) on 2026-05-15
- [x] Draft the ADR 018 amendment marking line 50/63 resolved — landed as ADR 018 Amendment 2026-05-15
- [x] Bring worker.js into the repo with CIDR-aware matcher — `deploy/cloudflare-worker/{worker.js, ip-matcher.mjs, safe-ips.mjs}`
- [x] Write CIDR-matcher unit tests (TDD red → green) — 37 assertions at `test/js/__tests__/cloudflare-worker-ip-matcher.test.mjs`; module-shape smoke at `deploy/cloudflare-worker/worker.test.js`
- [x] Migrate the hardcoded RapidAPI key into Cloudflare Worker secrets via Terraform — `deploy/modules/cloudflare-worker/main.tf` provisions `cloudflare_workers_secret.rapidapi_key`; key sourced via `TF_VAR_cloudflare_rapidapi_key`
- [ ] Add the UR-IP-drift detection job (optional follow-up — could be its own ticket if scope grows)
- [x] Update ADR 016 Confirmation to remove the Referer-header requirement — done 2026-05-25 (ADR 016 Amendment 2026-05-25): requirement removed; the worker's CIDR-aware `safeIps` IP allowlist is now the monitor's authorisation path (the Referer workaround was never viable — the operator's UR plan can't send custom headers). Reassessment criterion line 67 marked resolved.
- [x] Operator: populate four new GH Actions secrets from 1P Voder — done 2026-05-23. Four `Addressr Cloudflare *` items created in the Voder vault (source of truth); `TF_VAR_cloudflare_api_token`, `TF_VAR_cloudflare_account_id`, `TF_VAR_cloudflare_zone_id`, `TF_VAR_cloudflare_rapidapi_key` synced to `mountain-pass/addressr` and verified. Token validated against Cloudflare `/user/tokens/verify` (active; Workers Scripts + Workers Routes scopes confirmed; can see `cool-bush-ca66` and the `api.addressr.io/*` route). RapidAPI key sourced from local `.env` (matches the dashboard worker value). Note: "Workers Secrets Edit" is NOT a separate Cloudflare scope — Workers Scripts Edit covers secret bindings.
- [x] Import the existing dashboard worker (script + route) into TF state — done 2026-05-25 via TF 1.5+ `import {}` blocks in CI (not a manual CLI import). The 2.6.13… err 2.6.12 release's `terraform apply` reported `2 imported, 2 added, 2 changed, 2 destroyed` — `Apply complete`. The v5 import IDs (`<account_id>/cool-bush-ca66`, `<zone_id>/<route_id>`) were correct. In-place script update, no edge outage.
- [x] **Cutover applied + verified (2026-05-25).** Live worker confirmed: module/export format (the esbuild bundle), `RAPIDAPI_KEY` secret binding (key no longer hardcoded), `compatibility_date=2024-01-01`, fresh `safeIps` (incl. `168.119.53.160`), `api.addressr.io`+Referer → 200 with real content, no-Referer → `no-origin not permitted`. P040 fully resolved.
- [x] RapidAPI key rotated (the prior value was exposed in an agent transcript) → new key in 1P Voder + GH + the worker binding; old key revoked on RapidAPI; production verified healthy post-revocation.
- [ ] Operator: confirm Uptime Robot alerts cease over a 24-hour observation window (the fresh `safeIps` + CIDR matcher are now live).

**Implementation deviations worth recording (for the retro / ADR 032):** the v5 provider needed (a) `cloudflare_workers_route.script` not `script_name`; (b) no `cloudflare_workers_secret` resource — secrets are inline `bindings`; (c) single-`content` only → esbuild bundling added (`npm run build:worker`, gitignored artifact); (d) TF pinned to 1.9.8 for import blocks, which then required `nonsensitive()` on the EB `proxy_auth_*` `for_each` (sensitive values rejected by ≥1.5). The cutover also surfaced two pipeline issues: the publish-coupling (P039) cost three version bumps, and a stale post-rollback smoke assertion (`hostSet=true`) blocked releases until fixed.

## Dependencies

- **Blocks**: (none — ADR 016 amendment can be reverted once this lands, but that's a small follow-up, not a block)
- **Blocked by**: (none — but pairs with P040 option 2 worker patch landing first so the matcher behaviour is locked in before TF takes over deploy)
- **Composes with**: P040 (Uptime Robot 401 alerts — Cloudflare Worker allowlist CIDR-match bug + UR IP drift)

## Related

- **ADR 018** (Cloudflare Worker as API Key Proxy) — line 50 ("worker is not version-controlled") and line 63 ("Version-controlling the worker script") name the gap this ticket closes.
- **ADR 016** (Uptime Robot for External Availability Monitoring) — Confirmation currently requires the P040 Referer-header workaround; closing P042 unblocks removing it.
- **ADR 024** (Origin Gateway Auth Header Enforcement) — the existing 1P Voder → GH Actions → TF secret flow this ticket extends to Cloudflare.
- **P040** (Uptime Robot 401 alerts — Cloudflare Worker allowlist CIDR-match bug + UR IP drift) — the realised consequence that motivates this structural fix.
- **JTBD-400** (Ship releases reliably from trunk — infra-boundary release steps are checkable artefacts, not memory) — the desired outcome line that names "Infra-boundary release steps (Terraform apply, domain population, cutover) are checkable artefacts, not memory" applies directly.
- `reference_addressr_secrets` memory — describes the existing 1P Voder → GH Actions secrets → Terraform → EB env vars flow being extended.
- `feedback_zero_outage_search_upgrades` memory — operator preference for blue/green and zero-outage flips; the worker migration to Terraform should not interrupt the live route binding.

(captured via /wr-itil:capture-problem; expand at next investigation)
