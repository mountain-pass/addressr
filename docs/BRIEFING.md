# Project Briefing

This file is injected into every Claude Code session. It contains institutional knowledge that isn't obvious from the code alone. Maintained by the `/retrospective` skill.

## What You Need to Know

- **Production runs the v2 API** (`addressr-server-2`, waycharter-based HATEOAS). NOT the v1 swagger-tools API. See `deploy/deploy.sh` line 22.
- **CI does NOT test the v2 API.** The 6 v2 test scenarios in `addressv2.feature` exist but are not in the `test:nogeo` pipeline. This is the #1 risk gap.
- **Two backends behind RapidAPI**: `backend.addressr.io` and `backend2.addressr.io`, round-robin load balanced. A Cloudflare Worker (`cool-bush-ca66`) proxies requests from addressr.io and Uptime Robot, injecting a RapidAPI API key.
- **Production OpenSearch is 1.3** (AWS managed, `addressr3` domain, t3.small.search x2). This matches the CI test container (opensearchproject/opensearch:1.3.20). The opensearch-js v3 client has been verified working against production.
- **The Dockerfile is stale**: uses Node 16 and runs v1 API. Needs updating to Node 22 and addressr-server-2.
- **Trunk-based development per DORA.** No branch protection rules. Risk management is via the hook-based risk scoring system, not server-side gates.
- **Revenue-generating service.** Paid and free-tier consumers on RapidAPI. Business metrics are confidential — never commit user counts, revenue, pricing, or traffic volumes to the repo.
- **Babel transpilation is tech debt.** Node 22 has native ESM but the project still uses Babel. See ADR 005.
- **Credentials**: production OpenSearch creds in `.env`, AWS + Cloudflare creds in `~/.profile`. Use these for debugging production — never commit them.
- **addressr.io website** is a separate Gatsby project on Netlify at `../addressr.io/`. It calls the API via the Cloudflare Worker.
- **19 ADRs exist** in `docs/decisions/` documenting all major architectural choices (OpenSearch, dual API, EB deployment, HATEOAS, RapidAPI, Cloudflare Worker, etc.).

## What Will Surprise You

- The file `client/elasticsearch.js` and all `ELASTIC_*` env vars reference "elasticsearch" but the system actually runs OpenSearch. Historical naming from before the fork.
- The v1 API (`addressr-server`) is still packaged and shipped in the npm module even though only v2 is deployed. Both binaries exist in package.json.
- Elastic Beanstalk uses 100% Spot instances with AllAtOnce deployment. No rolling deploy, no automated rollback. Uptime Robot detects outages within 5 minutes but recovery is manual.
- The G-NAF data loader requires up to 8GB RAM (`--max_old_space_size=8196`) and must run as a separate binary before the server.
- `turbo` is used for build orchestration but this is a single-package repo — it may be over-engineering. See ADR 008.
- PostToolUse hook input for Agent provides `tool_response` (a dict with `content` array of `{type, text}` objects), NOT `tool_output`. Use `tool_response.content[].text` to read agent output in hooks.
- Risk scorer agents have no Bash tool — they output structured markers (`RISK_SCORES:`, `RISK_VERDICT:`, `RISK_BYPASS:`) and `risk-score-mark.sh` PostToolUse hook writes all score files deterministically. Never write score files directly.
