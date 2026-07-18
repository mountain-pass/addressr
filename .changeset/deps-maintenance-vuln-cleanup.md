---
'@mountainpass/addressr': patch
---

Dependency maintenance: clear all npm-audit vulnerabilities and refresh aged packages.

Removed three unused dependencies that rooted every remaining audit finding: the dead `istanbul-middleware` and `istanbul` dev tools (coverage runs on `nyc`), and the production `js-yaml` dependency orphaned by the v1 Swagger removal. The abandoned `npm-check` dev tool is replaced by maintained equivalents: `depcheck` for unused-dependency detection and `npm-check-updates` for the outdated and interactive-update scripts. Together these bring `npm audit` to zero (previously 1 critical / 8 high / 9 moderate / 2 low, all dev-only).

Bumped in-range dependencies to current, including the `@opensearch-project/opensearch` client (3.5 to 3.6) and `dotenv` (to 17). The four Babel-8-coupled majors remain deferred with documented reasons in `.dry-aged-deps.json`.
