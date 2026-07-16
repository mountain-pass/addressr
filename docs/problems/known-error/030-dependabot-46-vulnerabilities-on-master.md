# Problem 030: Dependabot reports 46 vulnerabilities on master (2 critical, 23 high, 19 moderate, 2 low)

**Status**: Known Error
**Reported**: 2026-04-21
**Priority**: 12 (High) — Impact: Significant (4) x Likelihood: Possible (3) _(re-rated 2026-07-16: non-breaking patch batch cleared all critical advisories from the prod path and cut prod-reachable findings 15 → 9)_
**Effort**: XL _(remaining fix = migrate off swagger-tools; requires ADR-003 reassessment — see Fix Strategy)_
**WSJF**: 3.0 = (12 × 2.0) / 8

## Description

Every `git push` to `origin master` currently surfaces a GitHub Dependabot advisory banner in the `push:watch` output:

> `GitHub found 46 vulnerabilities on mountain-pass/addressr's default branch (2 critical, 23 high, 19 moderate, 2 low). To find out more, visit: https://github.com/mountain-pass/addressr/security/dependabot`

Observed 2026-04-21 on consecutive pushes (`e0b7ac1`, `859032b`). No one has triaged the alerts; no issues or PRs in the repo currently track any specific CVE; there is no Dependabot-related ticket in `docs/problems/`.

addressr is a **revenue-generating npm package + Docker image + AWS-deployed API** on RapidAPI. 2 critical + 23 high disclosed vulnerabilities on a production codebase is a material exposure:

- Any vulnerable code path reachable by consumer request routing could be a live attack surface against paid and free-tier users.
- The npm package is installed by self-hosted-operator persona consumers — transitive vulns ship to them automatically on next install.
- The Docker image likewise carries any base-image or transitive-dep vulns.

The risk is not that all 46 are exploitable — most CVEs in a large dep tree are in code paths addressr never exercises. The risk is that **no one has checked** which are, and that number compounds every week as new CVEs land.

## Symptoms

- `npm run push:watch` surfaces the banner on every push. No other warning signal exists outside the GitHub UI.
- `https://github.com/mountain-pass/addressr/security/dependabot` (requires authenticated maintainer access) lists the detailed alerts. Not visible to the Claude agent over WebFetch.
- No Dependabot PRs have been auto-opened recently — suggests automated dependency update PRs are either disabled or have been dismissed without merge.
- Dependency freshness tooling (`dry-aged-deps --check` in CI) shows only 4 mature-but-not-urgent updates (`babel-plugin-istanbul`, `dotenv`, `globals`, `turbo`), none of which correspond to the critical/high CVE surface — suggesting the critical vulns are in older or deeper transitive deps not yet flagged as "mature".

## Workaround

**Partial mitigation shipped 2026-07-16**: the non-breaking `npm audit fix` batch cleared 21 of 48 findings including every critical on the prod path. The residual exposure (9 prod-reachable findings, all in the swagger-tools v1 middleware line) is contained by the ADR 024 defence-in-depth (RapidAPI gateway + Cloudflare Worker + proxy auth), which limits what unauthenticated internet traffic can reach. Reachability of the residual line is now verified and documented (v1 Swagger request-path middleware — see Confirmed findings), so this is a characterised containment rather than the earlier unverified hope.

**Reproduction**: `npm audit` against the committed lockfile deterministically reproduces the finding set (27 as of 2026-07-16).

## Impact Assessment

- **Who is affected**: End users — Web/App Developer, AI Assistant User, Data Quality Analyst, Self-Hosted Operator personas — via the npm package (self-hosted consumers automatically inherit vulns on next install), Docker image (same), and live RapidAPI API (if an exploitable code path is reachable). Maintainer persona J7 (Ship releases reliably from trunk) indirectly, because ignored security alerts erode the quality guarantee every release implicitly makes.
- **Frequency**: Continuous. The vulnerabilities exist right now on `master`. Every release inherits them. Every new CVE disclosure against a dep in our tree adds to the count.
- **Severity**: Significant today (unknown how many of the 46 are actually reachable) — could escalate to Severe once triage confirms any critical is exercised by the runtime path. Likelihood of at least one exploitable vuln in the set is Likely (4) given the count and the age of some dep lines.
- **Analytics**: None currently collected. First step of triage is to read the advisories (requires maintainer GitHub access).

## Root Cause Analysis

### Why we're at 46 alerts

Preliminary hypotheses, not yet verified:

1. **Transitive dep drift**: Older direct deps (e.g., `dotenv@10.0.0` vs latest 17.x — 6 major versions behind per `dry-aged-deps`) pull in transitive deps that themselves have CVEs. Upgrading the direct dep may clear multiple alerts.
2. **Dependabot PR fatigue**: If auto-PRs were opened and dismissed or left stale, the alerts accumulated without ever being remediated.
3. **Vulnerability in the OpenSearch dep line**: `@opensearch-project/opensearch@^3.5.1` pulls in HTTP / crypto / serialisation deps. OpenSearch 1.x's upstream EOL (P028) means any dep that's pinned for 1.x compatibility cannot be upgraded without breaking.
4. **Dev-only vs prod**: Some fraction may be in dev deps (`turbo`, `babel-*`, test harness) which don't ship — triage will sort these out.
5. **Node 16 Dockerfile (see BRIEFING.md)**: the stale Dockerfile runs Node 16 which is itself EOL and likely flagged.

### Confirmed findings (2026-07-16 triage)

`npm audit` on 2026-07-16 reported **48** vulnerabilities (3 critical, 20 high, 21 moderate, 4 low) — up from 46 at ticket creation, confirming the weekly-compounding hypothesis. Triage results:

- **Non-breaking `npm audit fix` applied** (package-lock.json only; package.json untouched; `npm run build` verified green): **48 → 27** (1 critical, 14 high, 10 moderate, 2 low). All 3 pre-fix criticals cleared from their original positions (handlebars and shell-quote fully; lodash reduced to a dev-only instance).
- **Every remaining finding chains to one of three direct deps whose only npm-offered fix is a breaking change:**
  - **`swagger-tools@0.10.4` (prod)** — carries **all 9 remaining prod-reachable vulns** (8 high, 1 moderate): body-parser, busboy, dicer, multer, path-to-regexp, qs, swagger-tools, validator, z-schema. These are v1 Swagger request-path middleware, exercised by API routing. swagger-tools is unmaintained; npm's "fix" is a breaking _downgrade_ to 0.9.8, which is not a real remedy. swagger-tools is load-bearing for the v1 API per ADR-003 (Dual API Architecture), and ADR-003 explicitly lists "swagger-tools becoming a security liability" as a reassessment trigger — **that trigger is now met** (architect review 2026-07-16).
  - **`istanbul-middleware@0.2.2` (dev)** — carries the sole remaining critical (lodash@3.2.0 via archiver@0.14.4) plus several highs. Dev-only; not shipped in the npm package, Docker image, or deployed API.
  - **`npm-check@6.0.1` (dev)** — carries the remaining moderates/lows (got, inquirer, tmp, update-notifier line). Dev-only.
- **OpenSearch cross-check (P028)**: none of the remaining 27 findings are in the `@opensearch-project/opensearch` line — no cross-dependency with the 1.3 client pin. Hypothesis 3 refuted.
- **Hypothesis verdicts**: 1 (transitive drift) confirmed — the non-breaking batch cleared 21 findings without touching package.json; 3 (OpenSearch pin) refuted; 4 (dev vs prod split) confirmed — 18 of the 27 remaining are dev-only.
- **Reachability posture**: the 9 prod-reachable vulns sit behind the ADR 024 defence-in-depth (RapidAPI gateway + Cloudflare Worker + proxy auth), which limits unauthenticated exposure. Note: ADR-024's reassessment date (2026-07-15) has passed — worth reconfirming while it is being leaned on as this ticket's workaround.

### Investigation Tasks

- [x] Enumerate the full alert list — done 2026-07-16 via `npm audit` (48 findings; the GitHub Dependabot UI needs maintainer auth the agent lacks, `npm audit` against the same lockfile is the equivalent local source). Breakdown recorded in Confirmed findings above.
- [x] For each critical and high alert, determine (a) direct or transitive, (b) prod or dev, (c) reachable from an addressr entrypoint — done at dependency-line level: all remaining prod-reachable findings are v1 Swagger middleware under swagger-tools; all criticals are dev-only.
- [x] Check if any are blocked by the OpenSearch 1.3 client pin (cross-reference P028) — none are; no cross-dependency.
- [ ] Re-enable or reconfigure Dependabot auto-PRs if they have been disabled, so the count doesn't compound silently between now and remediation completion (needs maintainer GitHub settings access).
- [x] Batch-upgrade the safe-to-patch subset — done 2026-07-16: non-breaking `npm audit fix`, 48 → 27, shipped with this transition's changeset.
- [ ] For alerts that can't be patched without a major upgrade, spawn individual problem tickets — pending user direction on the ADR-003 reassessment (see Fix Strategy); dev-only lines (istanbul-middleware, npm-check) can be spawned as an M-effort ticket independently.

## Fix Strategy

1. **Shipped 2026-07-16 (this transition)**: non-breaking `npm audit fix` — lockfile-only, 48 → 27 findings, all prod-path criticals cleared. Release vehicle: `.changeset/p030-npm-audit-fix.md` (patch bump so the deployed API and Docker image pick up the patched lockfile).
2. **Remaining prod line (the XL residual)**: the 9 swagger-tools-rooted findings cannot be patched — remediation is an **ADR-003 reassessment** with user-owned options: drop the v1 Swagger API (ADR-003's considered option 2), replace the v1 framework, patch-fork swagger-tools, or accept-and-contain behind ADR 024. This is a substantive architecture decision, not a dependency bump — queued for user direction per architect review 2026-07-16.
3. **Remaining dev lines (M-effort, independent)**: replace or drop `istanbul-middleware` (archived upstream; carries the sole remaining critical) and `npm-check` (partially superseded by dry-aged-deps per ADR-015). No runtime surface; can proceed without the ADR-003 decision.
4. Re-enable Dependabot auto-PRs (or confirm why they are off) so the count stops compounding silently.

## Related

- [Problem P028 — OpenSearch 1.3.20 version debt](./028-opensearch-1-3-20-version-debt.known-error.md) — subset of the 46 alerts may be blocked by the 1.3 server/client compatibility pin; upgrading OpenSearch may clear some of them.
- [Problem P025 — GitHub Actions Node.js 20 deprecation](./025-github-actions-node20-deprecation.open.md) — adjacent version-debt ticket; the pattern is the same (managed-platform clock ticking while we don't upgrade).
- [BRIEFING.md](../BRIEFING.md) — "Dockerfile is stale: uses Node 16" — the Dockerfile's Node 16 base is itself a CVE source and should be addressed alongside this ticket.
- [`package.json`](../../package.json) — direct dependency list; `dotenv@10.0.0` is the most visibly-stale direct dep flagged by `dry-aged-deps`.
- [ADR-003 — Dual API Architecture](../decisions/003-dual-api-v1-swagger-v2-hateoas.accepted.md) — swagger-tools is load-bearing for the v1 API; ADR-003's "security liability" reassessment trigger is now met (see Fix Strategy).
- **Upstream report pending** -- false positive; detection misfire (remaining findings are already-published third-party security advisories — there is nothing new to report upstream; remediation is local migration off the affected dependency lines).
