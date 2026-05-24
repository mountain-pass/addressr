---
status: 'proposed'
date: 2026-05-15
decision-makers: [Tom Howard]
consulted: []
informed: []
reassessment-date: 2026-08-15
---

# ADR 032: Cloudflare Worker deployed via Terraform (not Wrangler)

> **Amendment 2026-05-25 — worker is esbuild-bundled before Terraform deploys it.** A `terraform validate` dry run against the real Cloudflare provider v5 surfaced two facts the original ADR did not account for:
>
> 1. `cloudflare_workers_script` (v5) accepts only a **single `content` string** (or `content_file`) — there is no attribute to upload sibling modules. So the modular source (`worker.js` importing `./ip-matcher.mjs` + `./safe-ips.mjs`) cannot deploy as separate files; only `worker.js` would upload and its imports would fail at the CF runtime.
> 2. The v5 route resource attribute is `script`, not `script_name`, and `cloudflare_workers_secret` does not exist in v5 — secrets are inline `bindings` (`{name, type = "secret_text", text}`) on the script, which the module already uses.
>
> **Resolution:** the worker is bundled with **esbuild** (`npm run build:worker` → `deploy/cloudflare-worker/worker.bundled.js`, a single ES module) before Terraform runs; `deploy/deploy.sh` invokes it ahead of every `terraform` command, and `cloudflare_workers_script.content` reads the bundle. The bundle is a **deploy-time artifact (gitignored)** — regenerated from source each run, so the unit-tested source (`ip-matcher.mjs`) and the deployed bundle cannot drift. The three-file modular split is retained for testability.
>
> **This does not reopen the Wrangler decision.** esbuild is purely a _bundler_ (no deploy, no secret handling); Terraform still owns deploy + the `RAPIDAPI_KEY` secret binding. esbuild bundles, Terraform deploys — they compose. It also does not conflict with [ADR 005 (Babel transpilation)](005-babel-transpilation.accepted.md): Babel transpiles the Node.js server/loader (`babel . -d lib`, which already ignores `deploy/`); the worker is a separate V8-isolate artifact built by a different tool. (Architect agent was unavailable at amendment time; this reasoning was self-reviewed and recorded here per the architecture-gate intent.)

## Context and Problem Statement

The Cloudflare Worker described in [ADR 018](018-cloudflare-worker-api-proxy.accepted.md) (worker name `cool-bush-ca66`; routes `api.addressr.io/*` and `cool-bush-ca66.addressr-key-provider.workers.dev/*`) is the gateway boundary for unauthenticated browser traffic from the addressr.io SPA and for IP-stable monitoring (Uptime Robot per ADR 016). It injects the RapidAPI key and rejects requests that match neither `safeHosts` (Referer/Origin) nor `safeIps` (CF-Connecting-IP).

ADR 018 names three "Bad" consequences that remain open:

- Line 48 — the RapidAPI key is hardcoded in the worker script rather than using Cloudflare secrets/env vars.
- Line 49 — the Uptime Robot IP allowlist must be manually maintained.
- Line 50 — the worker is not version-controlled; it exists only in Cloudflare's platform.

ADR 018 Reassessment Criterion at line 63 explicitly names "Version-controlling the worker script" as the trigger for revisiting that posture. [P040](../problems/040-uptime-robot-401-api-addressr-missing-proxy-auth.known-error.md) was the realised cost: a latent `safeIps.includes(srcIp)` bug rejected IPs inside CIDR ranges Uptime Robot publishes, and the worker source not being in the repo meant the fix could not be unit-tested or PR-reviewed — only pasted-from-chat into the dashboard. [P042](../problems/042-version-control-cloudflare-worker-via-terraform.open.md) is the ticket this ADR exists to close.

This ADR chooses the **mechanism** for bringing the worker into version control and the deploy pipeline. The worker's behaviour (Referer safelist + IP allowlist + key injection) is unchanged.

## Decision Drivers

- **JTBD-400 (Ship releases reliably from trunk — "Infra-boundary release steps are checkable artefacts, not memory")** — the operator-paste step that produced P040's "patch sat in repo but never deployed" failure mode is the canonical instance JTBD-400 names. Replacing it with `terraform apply` turns the worker deploy into a PR-reviewable diff with CI on it.
- **JTBD-200 (Protect the chosen gateway boundary)** — the worker IS the gateway boundary for the Mountain Pass deployment; a partial configuration (e.g. missing RapidAPI key) must fail loud rather than silently ship an unauthenticated proxy (JTBD-200 line 25 desired outcome).
- Consistency with the rest of `deploy/` — the AWS path is Terraform-managed via the existing 1Password Voder → GitHub Actions → Terraform secret flow ([ADR 030](030-opensearch-domain-terraform-module.proposed.md) Scope; `reference_addressr_secrets` memory); Cloudflare should not fork the secret spine.
- Reproducibility — any future worker change (drift-detection job, new safe host, additional consumer route, key rotation) should be a code-reviewed `terraform apply`, not a console session.
- Zero-outage cutover — the existing dashboard worker has been serving production traffic for years; the migration must not interrupt the live route binding (per the `feedback_zero_outage_search_upgrades` memory's broader principle).

## Considered Options

1. **Keep the worker in the Cloudflare dashboard, paste-from-repo for changes** (status quo + repo-as-landing-pad).
2. **Adopt Wrangler** (`wrangler.toml` + `wrangler deploy` from CI) to manage the worker.
3. **Adopt the Cloudflare Terraform provider** (`cloudflare/cloudflare`) and add a `deploy/modules/cloudflare-worker/` module.

## Decision Outcome

Chosen option: **Option 3 — Cloudflare Terraform provider, encapsulated in `deploy/modules/cloudflare-worker/`. Cutover via `terraform import` of the existing dashboard-managed worker into state, then no-op first apply.**

Reasoning:

- **Option 1** is rejected because it institutionalises the gap that P042 exists to close. The 2026-05-14 P040 work session produced the landing-pad pattern (`docs/cloudflare-worker.template.js.txt`) as a transient intermediate step explicitly captioned "Edits here do not deploy anything" — the realised cost was a P040 fix that sat in the repo and never reached production. JTBD-400 names this exact failure mode.
- **Option 2 (Wrangler)** would mean two secret-management spines: AWS via Terraform + `TF_VAR_*` from 1Password Voder (per `reference_addressr_secrets`), Cloudflare via `wrangler secret put` + a separate flow. Wrangler stores secrets in Cloudflare-only state and uses a different deploy-from-CI model. The 1Password → GitHub Actions → Terraform path is already load-bearing for AWS credentials, OpenSearch master users (per ADR 030), and the ADR 024 origin gateway auth header. Forking that spine for a single worker is net-negative ergonomics.
- **Option 3 (Cloudflare TF provider)** keeps one secret spine and one deploy command (`terraform apply`) across AWS + Cloudflare. The trade-off is that the provider's worker resources lag behind Wrangler on newer Cloudflare runtime features (e.g., the bleeding edge of Durable Objects, R2 bindings, AI bindings). For a stateless key-injecting proxy this lag is acceptable; the worker uses none of those features and is unlikely to need them.

### Cutover mechanism

`terraform import` the existing `cool-bush-ca66` worker script and the `api.addressr.io/*` route into the new module's state. The first `terraform plan` after import must show a no-op diff. Subsequent applies roll forward changes.

The operator runs the import once, before the next release:

```sh
terraform import 'module.cloudflare_worker.cloudflare_workers_script.proxy' '<account_id>/cool-bush-ca66'
terraform import 'module.cloudflare_worker.cloudflare_workers_route.api_addressr_io' '<zone_id>/<route_id>'
```

Risk: if state and reality disagree on any attribute (e.g., compatibility_date in the dashboard vs. compatibility_date declared in the module), the next apply will recreate the worker. The recreate window at Cloudflare's edge is ~30 seconds. Rollback is: revert the changeset, re-apply, edge stabilises.

The alternative considered — provisioning a new worker under a new name and swapping the `api.addressr.io/*` route — was rejected as overkill for a stateless edge proxy whose route binding is atomic at Cloudflare's edge.

### Module shape

```
deploy/cloudflare-worker/
  worker.js           # entry — ES module export default { fetch(request, env, ctx) {…} }
  ip-matcher.mjs      # CIDR-aware safeIps matcher (the P040 fix; testable from Node)
  safe-ips.mjs        # safeIps + safeHosts data; sync-target for any future drift job
  worker.test.js      # module-shape smoke + RAPIDAPI_KEY fail-loud assertion

deploy/modules/cloudflare-worker/
  main.tf             # cloudflare_workers_script + cloudflare_workers_route + cloudflare_workers_secret
  variables.tf        # account_id, zone_id, script_name, rapidapi_key, worker_dir, route_pattern
  outputs.tf          # script_name, workers_dev_url, route_pattern
  versions.tf         # cloudflare/cloudflare ~> 5.0

test/js/__tests__/
  cloudflare-worker-ip-matcher.test.mjs   # 37 unit assertions pinning the CIDR matcher
```

The asymmetry vs. ADR 030's OpenSearch module (no sibling source directory) is deliberate — the OpenSearch resource is opaque AWS-managed infra, whereas the Cloudflare Worker resource carries bundled JS source. The two directories are separated so a future drift-detection job that rewrites `safe-ips.mjs` does not need to know about Terraform, and a future TF-only change does not need to touch the JS source tree.

### Scope

- **In scope**: the Mountain Pass production Cloudflare Worker described in ADR 018. RapidAPI key migrates from hardcoded-in-source to `cloudflare_workers_secret.rapidapi_key` populated via `var.cloudflare_rapidapi_key` sourced from 1Password Voder → GH Actions secret `TF_VAR_cloudflare_rapidapi_key`. Cloudflare API token similarly sourced via `TF_VAR_cloudflare_api_token`.
- **Out of scope**: rotating the RapidAPI key during this migration. Per P042 ticket, the current key value is preserved in place; the rotation event becomes a Terraform-managed secret-set rather than a dashboard edit when next required.
- **Out of scope**: the Self-Hosted Operator persona. Self-hosters who deploy without Cloudflare are unaffected; this module governs the Mountain Pass gateway only.
- **Out of scope**: the UR-IP drift detection follow-up named in P042 Investigation Tasks line 49. The drift job is a separate ticket; the current `safe-ips.mjs` is a one-shot re-sync from UR's published lists on 2026-05-15.
- **Out of scope**: removing the ADR 016 Referer-header workaround. ADR 016 Confirmation currently mandates the workaround; its removal is gated on production observation per ADR 016 Reassessment Criteria and is captured separately in P042 Investigation Tasks line 50.

## Consequences

### Good

- Worker source is version-controlled — P040-class fixes are PR-reviewable with CI on them
- One secret spine (1P Voder → GH Actions → Terraform) covers AWS + Cloudflare; no `wrangler secret put` flow to fork
- RapidAPI key moves out of source into `cloudflare_workers_secret`; rotation is a `terraform apply`
- `terraform plan` surfaces unintended worker changes before they reach prod
- The CIDR-matcher unit test that P040 could not host (because the source was not yet in the repo) now lives at `test/js/__tests__/cloudflare-worker-ip-matcher.test.mjs` and runs in pre-commit
- JTBD-400's "infra-boundary release steps are checkable artefacts, not memory" outcome is satisfied for the worker tier

### Neutral

- Cloudflare TF provider lags behind Wrangler on newer Cloudflare runtime features. Acceptable for a stateless proxy; the lag is not a release blocker for any current or planned worker behaviour.
- The `safe-ips.mjs` IP list still drifts as Uptime Robot publishes new probe locations. The drift cost is unchanged from ADR 018 line 49; what changes is that the next re-sync is a PR with a `terraform apply` rather than a dashboard paste.
- Operator-time `terraform import` step is required once at cutover. The import command and rollback are documented in this ADR and in P042.

### Bad

- One new Terraform module + one new Cloudflare provider in `deploy/versions.tf`. Maintenance burden roughly equivalent to ADR 030's OpenSearch module.
- Four new sensitive variables (`cloudflare_api_token`, `cloudflare_account_id`, `cloudflare_zone_id`, `cloudflare_rapidapi_key`) extend the 1Password Voder → GH Actions secret surface. Concrete operational work on top of the module itself.

## Confirmation

Mechanically checkable:

- `deploy/cloudflare-worker/worker.js`, `ip-matcher.mjs`, and `safe-ips.mjs` exist and `worker.js` imports the matcher and safe-list as ES modules.
- `deploy/modules/cloudflare-worker/main.tf`, `variables.tf`, `outputs.tf`, and `versions.tf` exist; root `deploy/main.tf` consumes the module via a `module "cloudflare_worker" {}` block. Ad-hoc `cloudflare_workers_*` resources in `deploy/main.tf` (outside the module) constitute a confirmation violation, mirroring the ADR 030 line 93 pattern.
- `node --test test/js/__tests__/cloudflare-worker-ip-matcher.test.mjs` passes — at minimum, all 37 assertions pinning the CIDR-match behaviour (v4 + v6 + cross-family + malformed-input) succeed.
- `node --test deploy/cloudflare-worker/worker.test.js` passes — at minimum the module loads and a `RAPIDAPI_KEY`-missing fetch returns Response 500 with body `RAPIDAPI_KEY not configured` (JTBD-200 line 25 partial-configuration-fails-loud requirement).
- `terraform state list` (post-apply against the production workspace) includes `module.cloudflare_worker.cloudflare_workers_script.proxy` and `module.cloudflare_worker.cloudflare_workers_route.api_addressr_io`.
- `terraform plan` shows zero changes to the worker after the initial `terraform import` no-op (confirms the imported state matches the dashboard source of record at cutover time).
- `.github/workflows/release.yml` Deploy step env block declares `TF_VAR_cloudflare_api_token`, `TF_VAR_cloudflare_account_id`, `TF_VAR_cloudflare_zone_id`, and `TF_VAR_cloudflare_rapidapi_key` and passes them through to the devcontainer's env.
- The release.yml smoke probes at lines 230-246 (worker Referer-accept → 200; worker no-Referer → "no-origin not permitted" body) continue to pass after the migration. The 401 body shape is load-bearing — `worker.js` preserves it for the probe assertion.

Narrative:

- The four new sensitive variables follow the established 1Password Voder → GitHub Actions secrets → Terraform path documented in `reference_addressr_secrets`. The Cloudflare API token has Workers Scripts Edit + Workers Routes Edit + Workers Secrets Edit scopes on the addressr account/zone.
- The landing-pad `docs/cloudflare-worker.template.js.txt` (transient artefact from the P040 work session, self-declaring its own deletion at line 16 — "delete this file in the same commit that lands P042's TF module") is removed in the same changeset that introduces the module. Coexistence with the canonical source would create conflicting "source of truth" claims.

## Pros and Cons of the Options

### Option 1: Status quo + repo landing-pad

- Good: zero new code; no provider to learn
- Bad: institutionalises the operator-paste step that produced P040's "fix sat in repo and never deployed" failure mode
- Bad: P040-class fixes remain untestable in CI because the worker source is not in the repo's test surface
- Bad: hardcoded RapidAPI key remains in source; rotation requires a dashboard edit
- Bad: violates JTBD-400's "infra-boundary release steps are checkable artefacts, not memory" outcome line

### Option 2: Wrangler

- Good: best-in-class for Cloudflare-specific runtime features (Durable Objects, R2/AI bindings)
- Good: `wrangler dev` for local-loop development
- Neutral: faster for greenfield workers than picking up the CF TF provider
- Bad: forks the secret spine — `wrangler secret put` is a different mechanism than the project's existing 1P → GHA → Terraform path
- Bad: two deploy commands in the release pipeline (`terraform apply` for AWS + `wrangler deploy` for the worker) where one would do
- Bad: state lives in Cloudflare's platform, not in TFC alongside the rest of the deploy state

### Option 3: Cloudflare Terraform provider (chosen)

- Good: one secret spine; one deploy command; one state location
- Good: matches the module-encapsulated IaC pattern ADR 030 established for the search tier
- Good: `terraform plan` surfaces unintended worker changes
- Neutral: marginally more upfront scaffolding than Option 2 for a single worker; pays back as soon as the worker surface grows (drift job, key rotation, new consumer route)
- Bad: provider lags Wrangler on newer Cloudflare runtime features. Out of scope for the current worker; reassessment trigger documented below.

## Reassessment Criteria

- Cloudflare TF provider falls behind on a worker runtime feature the project's worker actively needs (e.g., a Durable Object binding, R2 binding, or AI binding that Wrangler supports but the provider does not) → revisit Wrangler-vs-provider, potentially keeping the provider for the existing key-injecting proxy and adding Wrangler for any feature-rich newer workers.
- Worker surface outgrows a single module — e.g., a UR-IP-drift detection worker, a separate auth-token-rotation worker, or a multi-region fan-out — and the single-module shape becomes awkward → revise the module shape (per-worker submodules vs. a generic factory) before adding the second worker.
- ADR 016 (Uptime Robot monitoring) Confirmation removes the Referer-header workaround → recheck that this ADR's smoke-probe surface in release.yml still aligns with ADR 016's final shape.
- Before 2026-08-15, whichever comes first.

## Related

- [ADR 016 — Uptime Robot for External Availability Monitoring](016-uptime-robot-monitoring.accepted.md) — the monitor that surfaces worker-layer auth failures. Its Reassessment Criterion "P042 landed" is satisfied by this ADR landing in production; the follow-up Referer-header removal is captured separately in P042 Investigation Tasks line 50.
- [ADR 018 — Cloudflare Worker as API Key Proxy](018-cloudflare-worker-api-proxy.accepted.md) — the worker this ADR brings under version control. ADR 018's line 50 "Bad: worker not version-controlled" Consequence and line 63 Reassessment Criterion "Version-controlling the worker script" are resolved by this ADR landing; see the ADR 018 Amendment 2026-05-15 marker.
- [ADR 024 — Origin Gateway Auth Header Enforcement](024-origin-gateway-auth-header-enforcement.accepted.md) — independent layer at the EB origin. The worker layer (this ADR) sits in front and rejects with a distinct response body shape; both layers are probed in release.yml smoke tests for layer-distinguishability.
- [ADR 030 — OpenSearch Domain Terraform Module](030-opensearch-domain-terraform-module.proposed.md) — module-shape and Confirmation-language precedent for this ADR. The asymmetry (sibling source directory `deploy/cloudflare-worker/`) is the only structural difference.
- [Problem P040 — Uptime Robot 401 alerts: Cloudflare Worker safeIps CIDR-match bug + UR IP drift](../problems/040-uptime-robot-401-api-addressr-missing-proxy-auth.known-error.md) — the realised cost that motivated bringing this work to the front of the queue.
- [Problem P042 — Version-control the Cloudflare Worker via Terraform](../problems/042-version-control-cloudflare-worker-via-terraform.open.md) — the ticket this ADR closes.
- `reference_addressr_secrets` memory — describes the 1Password Voder → GitHub Actions → Terraform secret flow this ADR extends to Cloudflare.
- [JTBD-200 — Protect the chosen gateway boundary](../jtbd/self-hosted-operator/JTBD-200-protect-gateway-boundary.validated.md) — boundary the worker enforces; line 25 partial-configuration-fails-loud requirement is the source of the RAPIDAPI_KEY fail-loud Confirmation.
- [JTBD-400 — Ship releases reliably from trunk](../jtbd/addressr-maintainer/JTBD-400-ship-releases-reliably-from-trunk.validated.md) — line 33 "Infra-boundary release steps are checkable artefacts, not memory" outcome; the load-bearing alignment for this ADR.
