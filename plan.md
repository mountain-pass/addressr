# Dependency Upgrade Plan

Based on `dry-aged-deps` analysis: **52 outdated packages, 45 safe updates** (mature ≥7 days, no known vulnerabilities).

## Phase 1: Safe Semver-Compatible Updates (Low Risk)

These stay within the existing semver range (`wanted` version). Run and test in one batch:

### Production Dependencies
| Package | Current | Target | Age (days) |
|---------|---------|--------|------------|
| @changesets/cli | 2.26.2 | 2.30.0 | 9 |
| @opensearch-project/opensearch | 2.0.0 | 2.13.0 | 341 |
| debug | 4.3.2 | 4.4.1 | 9 |
| dotenv | 10.0.0 | 10.0.0 | (current) |
| glob | 7.2.3 | 7.2.3 | (current) |
| glob-promise | 4.2.0 | 4.2.2 | 1109 |
| keyv | 4.0.3 | 4.5.4 | 50 |
| papaparse | 5.3.1 | 5.5.3 | 296 |
| semver | 7.5.4 | 7.7.4 | 34 |
| unzip-stream | 0.3.1 | 0.3.4 | 690 |
| wait-port | 0.2.9 | 0.2.14 | 903 |

### Dev Dependencies
| Package | Current | Target | Age (days) |
|---------|---------|--------|------------|
| @babel/cli | 7.14.5 | 7.28.6 | 58 |
| @babel/core | 7.14.6 | 7.29.0 | 39 |
| @babel/node | 7.14.7 | 7.29.0 | 39 |
| @babel/plugin-proposal-class-properties | 7.14.5 | 7.18.6 | 1353 |
| @babel/plugin-transform-runtime | 7.14.5 | 7.29.0 | 39 |
| @babel/preset-env | 7.14.7 | 7.29.0 | 39 |
| @babel/preset-react | 7.14.5 | 7.28.5 | 139 |
| @babel/register | 7.14.5 | 7.28.6 | 58 |
| @babel/runtime | 7.23.2 | 7.28.6 | 58 |
| babel-plugin-istanbul | 6.0.0 | 6.1.1 | 187 |
| chai | 4.3.4 | 4.5.0 | 79 |
| eslint-plugin-promise | 5.1.0 | 5.2.0 | 1530 |
| eslint-plugin-react | 7.24.0 | 7.37.5 | 60 |
| eslint-plugin-unicorn | 34.0.1 | 34.0.1 | (current) |
| ngrok | 4.0.1 | 4.3.3 | 1040 |
| nodemon | 2.0.9 | 2.0.22 | 19 |
| prettier-config-standard | 4.0.0 | 4.1.0 | 943 |

**Action:**
```bash
npm update
npm test
```

---

## Phase 2: Major Version Upgrades - Dev Dependencies (Medium Risk)

These require bumping the semver range in package.json. Update individually and test after each.

### 2a: ESLint Ecosystem
| Package | Current | Latest | Notes |
|---------|---------|--------|-------|
| eslint | 7.x | 9.x | Major rewrite; flat config system in v9 |
| eslint-config-prettier | 8.x | 10.x | Must match eslint version |
| eslint-plugin-prettier | 3.x | 5.x | Must match eslint + prettier versions |
| eslint-plugin-import | 2.x | 2.x | Check compat with new eslint |
| eslint-plugin-node | 11.x | (deprecated) | Replace with eslint-plugin-n |
| eslint-plugin-security | 1.x | 3.x | |
| eslint-plugin-unicorn | 34.x | 60.x+ | Large jump, many new rules |
| eslint-plugin-promise | 5.x | 7.x | |
| eslint-plugin-react | 7.x | 7.x | Already latest major |
| babel-eslint | 10.x | (deprecated) | Replace with @babel/eslint-parser |

**Strategy:** This is the highest-effort upgrade. Consider doing it as a dedicated PR:
1. Replace `babel-eslint` with `@babel/eslint-parser`
2. Replace `eslint-plugin-node` with `eslint-plugin-n`
3. Upgrade eslint to v9 with flat config migration
4. Update all eslint plugins to versions compatible with eslint v9
5. Fix any new lint errors/warnings

### 2b: Prettier
| Package | Current | Latest | Notes |
|---------|---------|--------|-------|
| prettier | 2.x | 3.x | Breaking formatting changes, will reformat code |
| prettier-config-standard | 4.x | 7.x | Must match prettier version |

**Strategy:** Upgrade prettier, run `prettier --write .`, commit reformatted code separately.

### 2c: Testing Tools
| Package | Current | Latest | Notes |
|---------|---------|--------|-------|
| cucumber | 5.x | 6.x (or @cucumber/cucumber 11.x) | Package renamed to @cucumber/cucumber |
| chai | 4.x | 6.x | v5+ is ESM-only |
| nyc | 15.x | 18.x | |

**Strategy:**
1. `cucumber` → Migrate to `@cucumber/cucumber` (renamed package). This will require updating imports and possibly step definition syntax.
2. `chai` v6 is ESM-only — may require significant refactoring since the project uses CommonJS via Babel. Stay on v4 unless migrating to ESM.
3. `nyc` 18.x — straightforward upgrade, test coverage config may need minor updates.

### 2d: Other Dev Tools
| Package | Current | Latest | Notes |
|---------|---------|--------|-------|
| nodemon | 2.x | 3.x | Drops Node.js <10, otherwise minor changes |
| lint-staged | 11.x | 15.x | Config format may need updates |
| husky | 7.x | 9.x | v8+ changed to shell-based hooks in .husky/ dir |
| imagemin-lint-staged | 0.4.x | 0.5.x | |
| ngrok | 4.x | 5.x (beta) | Still beta — skip for now |

**Strategy:** Upgrade individually. Husky v9 requires migrating from package.json config to `.husky/` directory-based hooks — do this together with lint-staged.

---

## Phase 3: Major Version Upgrades - Production Dependencies (High Risk)

These affect runtime behavior. Upgrade one at a time with thorough testing.

### 3a: Low-Effort Production Upgrades
| Package | Current | Latest | Notes |
|---------|---------|--------|-------|
| debug | 4.x | 4.x | Already latest major |
| express | 4.x | 5.x | Express 5 has breaking API changes |
| js-yaml | 3.x | 4.x | Removed deprecated APIs (safeLoad → load) |
| semver | 7.x | 7.x | Already latest major |
| papaparse | 5.x | 5.x | Already latest major |

### 3b: Medium-Effort Production Upgrades
| Package | Current | Latest | Notes |
|---------|---------|--------|-------|
| got | 9.x | 14.x | v10+ is ESM-only — **cannot upgrade without ESM migration** |
| keyv | 4.x | 5.x | Major API changes |
| keyv-file | 0.2.x | 5.x | Massive jump, likely different API |
| json-ptr | 2.x | 3.x | API changes |
| uri-template-lite | 20.x | 23.x | |
| wait-port | 0.2.x | 1.x | API changes likely |
| http-link-header | 1.0.2 | 2.x | |

### 3c: Framework Upgrades (requires architecture decisions)
| Package | Current | Latest | Notes |
|---------|---------|--------|-------|
| express | 4.x | 5.x | Significant API changes |
| @opensearch-project/opensearch | 2.x | 3.x | Major version, API changes |
| got | 9.x | 14.x | ESM-only — requires project-wide ESM migration or replacement with `undici`/`node:fetch` |

**Strategy:** `got` ESM migration is the biggest blocker. Options:
1. Stay on got v9/v11 (last CJS version)
2. Replace `got` with built-in `fetch` (Node 18+)
3. Migrate entire project to ESM

---

## Recommended Execution Order

1. **Phase 1** — `npm update` for all semver-compatible updates → run tests
2. **Phase 2d** — nodemon, lint-staged, husky migration
3. **Phase 2b** — prettier 3.x upgrade + reformat
4. **Phase 2a** — ESLint ecosystem overhaul (dedicated PR)
5. **Phase 2c** — cucumber migration to @cucumber/cucumber
6. **Phase 3a** — js-yaml 4.x, express 5.x
7. **Phase 3b** — keyv, json-ptr, uri-template-lite, wait-port, http-link-header
8. **Phase 3c** — got replacement / ESM migration (largest effort, do last)

## Configuration

Add `.dry-aged-deps.json` to set project-specific thresholds:

```json
{
  "minAge": 7,
  "prod": {
    "minAge": 14,
    "minSeverity": "moderate"
  },
  "dev": {
    "minAge": 7,
    "minSeverity": "high"
  }
}
```
