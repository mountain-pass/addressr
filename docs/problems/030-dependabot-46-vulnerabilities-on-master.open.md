# Problem 030: Dependabot reports 46 vulnerabilities on master (2 critical, 23 high, 19 moderate, 2 low)

**Status**: Open
**Reported**: 2026-04-21
**Priority**: 16 (High) — Impact: Significant (4) x Likelihood: Likely (4)

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

**None.** The vulnerabilities exist whether or not we acknowledge them. The "workaround" is the current posture: rely on RapidAPI's gateway + Cloudflare Worker + proxy auth (ADR 024) to limit the attack surface reachable by unauthenticated internet traffic, and hope that vulnerable code paths aren't exercised by legitimate API call shapes.

This is not a real workaround — it's defence-in-depth banking on reachability that hasn't been verified.

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

### Investigation Tasks

- [ ] Open `https://github.com/mountain-pass/addressr/security/dependabot` (maintainer auth required) and export the full list of 46 alerts: package, CVE ID, severity, affected version range, fix version. Paste the table into this ticket.
- [ ] For each of the 2 critical and 23 high alerts, determine (a) is the package a direct or transitive dep, (b) is it a prod or dev dep, (c) is the vulnerable code path reachable from any addressr entrypoint (express handlers, loader, middleware, startup).
- [ ] Check if any of the 46 are blocked by the OpenSearch 1.3 client pin (cross-reference P028). If so, note the cross-dependency.
- [ ] Re-enable or reconfigure Dependabot auto-PRs if they have been disabled, so the count doesn't compound silently between now and triage completion.
- [ ] Batch-upgrade the safe-to-patch subset (dev deps, non-reachable prod deps) in one PR/release. Reduce the surface before tackling the harder cases.
- [ ] For alerts that can't be patched without a major upgrade, spawn individual problem tickets (split rule — cross-reference P028 where OpenSearch-related).

## Related

- [Problem P028 — OpenSearch 1.3.20 version debt](./028-opensearch-1-3-20-version-debt.open.md) — subset of the 46 alerts may be blocked by the 1.3 server/client compatibility pin; upgrading OpenSearch may clear some of them.
- [Problem P025 — GitHub Actions Node.js 20 deprecation](./025-github-actions-node20-deprecation.open.md) — adjacent version-debt ticket; the pattern is the same (managed-platform clock ticking while we don't upgrade).
- [BRIEFING.md](../BRIEFING.md) — "Dockerfile is stale: uses Node 16" — the Dockerfile's Node 16 base is itself a CVE source and should be addressed alongside this ticket.
- [`package.json`](../../package.json) — direct dependency list; `dotenv@10.0.0` is the most visibly-stale direct dep flagged by `dry-aged-deps`.
