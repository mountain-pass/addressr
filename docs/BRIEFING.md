# Project Briefing

This file is injected into every Claude Code session. It contains institutional knowledge that isn't obvious from the code alone. Maintained by the `/retrospective` skill.

## What You Need to Know

- **Production runs the v2 API** (`addressr-server-2`, waycharter-based HATEOAS). NOT the v1 swagger-tools API. See `deploy/deploy.sh` line 22.
- **CI tests both v1 and v2 APIs.** The `test:nogeo` pipeline includes rest2 and cli2 profiles for v2 coverage.
- **Two backends behind RapidAPI**: `backend.addressr.io` and `backend2.addressr.io`, round-robin load balanced. A Cloudflare Worker (`cool-bush-ca66`) proxies requests from addressr.io and Uptime Robot, injecting a RapidAPI API key.
- **Production OpenSearch is 1.3** (AWS managed, `addressr3` domain, t3.small.search x2). This matches the CI test container (opensearchproject/opensearch:1.3.20). The opensearch-js v3 client has been verified working against production.
- **The Dockerfile is stale**: uses Node 16 and runs v1 API. Needs updating to Node 22 and addressr-server-2.
- **Trunk-based development per DORA.** No branch protection rules. Risk management is via the hook-based risk scoring system, not server-side gates.
- **Revenue-generating service.** Paid and free-tier consumers on RapidAPI. Business metrics are confidential — never commit user counts, revenue, pricing, or traffic volumes to the repo.
- **Babel transpilation is tech debt.** Node 22 has native ESM but the project still uses Babel. See ADR 005.
- **Credentials**: production OpenSearch creds in `.env`, AWS + Cloudflare creds in `~/.profile`. Use these for debugging production — never commit them.
- **npm version mismatch**: Local runs Node 25 / npm 11, CI uses Node 22 / npm 10. Always regenerate lockfiles with `npx -y npm@10 install` before committing.
- **waychaser v5 migration complete** (v2.0.0). waycharter convenience API (`registerCollection` with `itemPath`/`itemLoader`) works well for new endpoints.
- **Two OpenSearch indices**: `addressr` (addresses, ~15M docs) and `addressr-localities` (localities, ~16k docs). Both use the same custom analyzer pipeline. Locality postcodes are derived from ADDRESS_DETAIL during loading (ADR 022).
- **addressr.io website** is a separate Gatsby project on Netlify at `../addressr.io/`. It calls the API via the Cloudflare Worker.
- **22 ADRs exist** in `docs/decisions/` documenting all major architectural choices (OpenSearch, dual API, EB deployment, HATEOAS, RapidAPI, Cloudflare Worker, locality postcode derivation, etc.).

## What Will Surprise You

- The file `client/elasticsearch.js` and all `ELASTIC_*` env vars reference "elasticsearch" but the system actually runs OpenSearch. Historical naming from before the fork.
- The v1 API (`addressr-server`) is still packaged and shipped in the npm module even though only v2 is deployed. Both binaries exist in package.json.
- Elastic Beanstalk uses 100% Spot instances with Rolling deployment, auto-rollback on health check failure (`RollbackLaunchOnFailure=true`), and `MinInstancesInService=2`. Health check targets `/health`.
- The G-NAF data loader requires up to 8GB RAM (`--max_old_space_size=8196`) and must run as a separate binary before the server.
- `turbo` is used for build orchestration but this is a single-package repo — it may be over-engineering. See ADR 008.
- PostToolUse hook input for Agent provides `tool_response` (a dict with `content` array of `{type, text}` objects), NOT `tool_output`. Use `tool_response.content[].text` to read agent output in hooks.
- Risk scorer agents have no Bash tool — they output structured markers (`RISK_SCORES:`, `RISK_VERDICT:`, `RISK_BYPASS:`) and `risk-score-mark.sh` PostToolUse hook writes all score files deterministically. Never write score files directly.
- `release:watch` script may falsely report "no new version published" even when publish+deploy+smoke tests all succeed. Verify via `gh run view` logs or npm registry if in doubt.
- The G-NAF LOCALITY table's `PRIMARY_POSTCODE` field is almost empty (~4% in NSW, 0% in OT). Always derive postcodes from ADDRESS_DETAIL records.
- WayCharter `itemLoader` returning `links` array works — they become Link headers. But waychaser strips `links` from JSON body content, so never embed link objects in the body.
- WayCharter collection items need `canonical` link follow to reach the item endpoint with custom Link headers. The `item` link from a collection gives a summary only.
- The TDD enforcement hook only recognizes `*.test.*`/`*.spec.*` files — Cucumber `.feature` files don't trigger RED state. Create a thin `.test.js` wrapper to enter the TDD cycle.
- **lint-staged silently drops files it doesn't recognise**, including `.changeset/*.md`. A `git commit` that stages `.changeset/p*.md` can finish successfully with the changeset missing from the resulting commit — the next release then sees "No changesets found" and ships with no version bump. Always `git show --stat HEAD` after a commit that touches `.changeset/`.
- **cli2 cucumber profile spawns the origin as a separate preinstalled binary** via `run-p --race start:server2:preinstalled dotest:cli2:nogeo`. Setting `process.env` in a step definition doesn't reach that process. Scenarios that mutate env vars mid-run must be tagged `@not-cli2`. Tracked by P010.
- **Terraform `required_version >= 0.13` rules out variable-level cross-variable validation** (that landed in TF 1.9). For pair-completeness guards (e.g. "both set or both empty"), use a resource-level `precondition` block, not `variable { validation {} }`.
- **`terraform validate` can't run locally** because the backend is Terraform Cloud (`app.terraform.io`). Local HCL syntax errors still surface; semantic/provider checks only run in CI. `terraform fmt -check -diff` is the best local-only sanity check.
- **The changesets release flow is gated on `steps.changesets.outputs.published == 'true'`.** Rollback without a working changeset requires adding a trivial patch changeset to trigger a fresh deploy — there is no `workflow_dispatch` shortcut. Keep `gh secret delete` + one-line changeset as the documented rollback for env-var-driven features.
- **ADR 024 proxy-auth secret chain**: 1Password Voder vault item `Addressr RapidAPI Proxy Secret` → GH repo secrets `TF_VAR_PROXY_AUTH_HEADER`/`TF_VAR_PROXY_AUTH_VALUE` → Terraform `dynamic "setting"` blocks in `deploy/main.tf` → EB env vars. To rotate: update 1P, pipe to `gh secret set`, cut a patch release. To disable: `gh secret delete` the pair + patch release.
- **Release smoke test now requires direct-bypass → 401**. Any regression that silently drops ADR 024 enforcement will fail the next release loudly. The probe is at `release.yml` "Smoke test production" step.
