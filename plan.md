# Dependency Upgrade Plan

Based on `dry-aged-deps` analysis: **52 outdated packages, 45 safe updates** (mature ≥7 days, no known vulnerabilities).

Each phase below is a separate PR, ordered to minimize risk.

---

## Phase 1: Semver-Compatible Updates (PR #1) — Low Risk, Small Effort

These stay within the caret range already declared in package.json.

### Steps
```bash
npm update
npm run build
npm run lint
npm test
```

### Production Dependencies
| Package | Current | Target | Age (days) |
|---------|---------|--------|------------|
| @changesets/cli | 2.26.2 | 2.30.0 | 9 |
| @opensearch-project/opensearch | 2.0.0 | 2.13.0 | 341 |
| debug | 4.3.2 | 4.4.1 | 9 |
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
| ngrok | 4.0.1 | 4.3.3 | 1040 |
| nodemon | 2.0.9 | 2.0.22 | 19 |
| prettier-config-standard | 4.0.0 | 4.1.0 | 943 |

### Files modified
- `package-lock.json` only

---

## Phase 2: Husky + lint-staged Migration (PR #2) — Low Risk, Small Effort

Husky v9 uses shell scripts in `.husky/` instead of package.json config. lint-staged v15 auto-stages files (no more `git add`).

### Steps
1. Upgrade packages:
   ```bash
   npm install --save-dev husky@^9 lint-staged@^15 imagemin-lint-staged@^0.5
   ```

2. Remove the `"husky"` key from `package.json`.

3. Simplify lint-staged config (remove `"git add"` from each array):
   ```json
   "lint-staged": {
     "*.{js,jsx}": "eslint --fix",
     "*.{json,css,md}": "prettier --write",
     "*.{png,jpeg,jpg,gif,svg}": "imagemin-lint-staged",
     ".circleci/config.yml": "circleci config validate"
   }
   ```

4. Initialize husky and create hook files:
   ```bash
   npx husky init
   echo "npm run pre-commit" > .husky/pre-commit
   echo "npm run check-deps" > .husky/pre-push
   ```

### Files modified
- `package.json` — remove `husky.hooks`, simplify `lint-staged`, bump versions
- `.husky/pre-commit` — new file
- `.husky/pre-push` — new file

### Testing
```bash
# Make a trivial change and verify pre-commit fires
git commit --allow-empty -m "test hooks"
```

---

## Phase 3: Prettier 3.x (PR #3) — Low Risk, Medium Effort

Will reformat code (large diff) but no logic changes.

### Steps
1. Upgrade:
   ```bash
   npm install --save-dev prettier@^3 prettier-config-standard@^7
   ```

2. If eslint-plugin-prettier breaks, also upgrade:
   ```bash
   npm install --save-dev eslint-plugin-prettier@^5 eslint-config-prettier@^10
   ```
   In `.eslintrc.json`, remove `"prettier/babel"` from `extends` (keep only `"prettier"`).

3. Reformat and verify:
   ```bash
   npx prettier --write .
   npm run lint
   npm run build
   npm test
   ```

### Files modified
- `package.json` — version bumps
- `.eslintrc.json` — possibly remove `"prettier/babel"` from extends
- All `.js`, `.json`, `.css`, `.md` files — reformatted (commit separately as `style: reformat with prettier 3`)

---

## Phase 4: ESLint Ecosystem Overhaul (PR #4) — Medium Risk, Large Effort

The most complex single upgrade. ESLint v9 introduces flat config but supports legacy `.eslintrc` via `ESLINT_USE_FLAT_CONFIG=false`.

### Steps

1. **Replace deprecated parsers/plugins:**
   ```bash
   npm uninstall babel-eslint eslint-plugin-node
   npm install --save-dev @babel/eslint-parser eslint-plugin-n
   ```

2. **Update `.eslintrc.json`:**
   - Change `"parser": "babel-eslint"` → `"parser": "@babel/eslint-parser"`
   - Add `"parserOptions": { "sourceType": "module", "requireConfigFile": false }`
   - Replace `"plugin:node/recommended"` → `"plugin:n/recommended"` in extends
   - Replace all `"node/..."` rule keys with `"n/..."`:
     - `node/no-unsupported-features/es-syntax` → `n/no-unsupported-features/es-syntax`
     - `node/no-deprecated-api` → `n/no-deprecated-api`
     - `node/shebang` → `n/hashbang`

3. **Upgrade ESLint and all plugins:**
   ```bash
   npm install --save-dev eslint@^9 eslint-config-prettier@^10 \
     eslint-plugin-prettier@^5 eslint-plugin-security@^3 \
     eslint-plugin-unicorn@^60 eslint-plugin-promise@^7 \
     eslint-plugin-import@^2 eslint-plugin-chai-friendly@^1 \
     eslint-plugin-eslint-comments@^3
   ```

4. **Update lint script** for legacy config mode:
   ```json
   "lint": "ESLINT_USE_FLAT_CONFIG=false eslint . --fix"
   ```

5. **Disable problematic new rules** (unicorn v34→v60 adds many):
   ```json
   "unicorn/prefer-module": "off",
   "unicorn/no-array-for-each": "off"
   ```

6. Run `npm run lint` and fix remaining issues.

### Files modified
- `package.json` — version bumps, script changes
- `.eslintrc.json` — parser, plugin refs, new rule overrides

### Testing
```bash
npm run lint
npm run build
npm test
```

---

## Phase 5: Nodemon 3.x (PR #5) — Low Risk, Small Effort

Drops Node <10 support (irrelevant since we require >=14.21.2).

```bash
npm install --save-dev nodemon@^3
```

### Testing
Run any `watch:*` script briefly to confirm restart behavior.

---

## Phase 6: js-yaml 4.x (PR #6) — Low Risk, Small Effort

v4 removed `safeLoad`/`safeDump`. The new `load`/`dump` use safe schema by default.

### Steps
```bash
npm install js-yaml@^4
```

Edit `swagger.js`:
- Line 6: `import { safeLoad } from 'js-yaml'` → `import { load } from 'js-yaml'`
- Line 26: `safeLoad(spec)` → `load(spec)`

### Testing
```bash
npm run build
npm test
```

---

## Phase 7: Cucumber Migration (PR #7) — Medium-High Risk, Large Effort

The `cucumber` package (v5) was renamed to `@cucumber/cucumber`. The `@windyroad/cucumber-js-throwables` dependency uses `setDefinitionFunctionWrapper` which was removed in v8+.

### Steps

1. Swap packages:
   ```bash
   npm uninstall cucumber @babel/polyfill
   npm install --save-dev @cucumber/cucumber@^7
   ```
   (v7 is the last version supporting `setDefinitionFunctionWrapper`)

2. Update imports:
   - `test/js/steps.js` line 5: `from 'cucumber'` → `from '@cucumber/cucumber'`
   - `test/js/world.js` lines 12-15: `from 'cucumber'` → `from '@cucumber/cucumber'`

3. Update `cucumber.js` config:
   - Remove `${NO_STRICT}` (strict is always on in v7)
   - Remove `--require-module @babel/polyfill` (deprecated; use `core-js` via `@babel/preset-env`)
   - Verify `-- --harmony_async_iteration` node flag still works

4. Update npm test scripts if the `cucumber-js` binary path changed.

### Files modified
- `package.json` — swap `cucumber` for `@cucumber/cucumber`, remove `@babel/polyfill`
- `cucumber.js` — update config flags
- `test/js/steps.js` — update import
- `test/js/world.js` — update import

### Testing
```bash
npm run test:nodejs:nogeo   # start with simplest profile
npm test                     # full suite
```

---

## Phase 8: Production Deps — Low-Effort Majors (PR #8) — Medium Risk

### 8a: http-link-header 1.x → 2.x
Used in: `test/js/drivers/AddressrRestDriver.js`, `test/js/drivers/AddressrRest2Driver.js`, `test/js/steps.js`, `service/address-service.js`, `service/DefaultService.js`
```bash
npm install http-link-header@^2
```
Verify `LinkHeader.parse()` and link property access still work.

### 8b: json-ptr 2.x → 3.x
Used in: `test/js/drivers/AddressrRestDriver.js`, `AddressrRest2Driver.js`, `AddressrEmbeddedDriver.js`, `service/setLinkOptions.js`
```bash
npm install json-ptr@^3
```
Verify `JsonPointer` and `encodeUriFragmentIdentifier` exports.

### 8c: wait-port 0.2.x → 1.x
Used in: `test/js/world.js`
```bash
npm install wait-port@^1
```

### 8d: uri-template-lite 20.x → 23.x
Used in: `test/js/drivers/AddressrDriver.js`, `AddressrEmbeddedDriver.js`
```bash
npm install uri-template-lite@^23
```

### Testing
```bash
npm run build
npm test
```

---

## Phase 9: keyv + keyv-file Upgrade (PR #9) — Medium Risk

Used in core data caching (`service/address-service.js` lines 27-29):
```js
const cache = new Keyv({ store: new KeyvFile({ filename: 'target/keyv-file.msgpack' }) })
```

### Steps
```bash
npm install keyv@^5 keyv-file@^5
```
Update `service/address-service.js` if the store API changed. Test caching behavior by running the loader.

### Testing
```bash
npm run build
npm run test:nodejs:nogeo
```

---

## Phase 10: Express 5.x (PR #10) — High Risk, Large Effort

**Blocker:** `swagger-tools` is unmaintained and may not work with Express 5.

### Key Express 5 breaking changes
- `app.del()` removed (use `app.delete()`)
- `req.host` returns hostname only (no port)
- `req.query` is a getter
- Rejected promises auto-call `next(err)`
- Stricter path matching

### Decision point
If `swagger-tools` is incompatible, options are:
1. Stay on Express 4.x (still receives security patches)
2. Replace `swagger-tools` with `swagger-jsdoc` + `swagger-ui-express`

### Testing
```bash
npm run build
npm run test:rest:nogeo   # REST tests exercise Express directly
npm test
```

---

## Phase 11: Replace got with native fetch (PR #11) — High Risk, Medium Effort

`got` v10+ is ESM-only. Instead of upgrading, replace with Node.js built-in `fetch` (stable since Node 18).

### Usage sites
1. `service/address-service.js` line 113: `await got.get(packageUrl)` — fetch package metadata
2. `test/js/drivers/AddressrRestDriver.js`: `got.extend({ baseUrl: url })` — test HTTP client
3. `test/js/drivers/AddressrRest2Driver.js` — similar

### Steps
1. Replace `got.get()` with `fetch()` in `service/address-service.js`:
   ```js
   // Before: const response = await got.get(packageUrl)
   // After:  const response = await fetch(packageUrl); const body = await response.text()
   ```
   Adapt `response.body` and `response.fromCache` usage.

2. Replace `got.extend()` pattern in test drivers:
   ```js
   // Before: this.requester = got.extend({ baseUrl: url })
   // After:  this.baseUrl = url; ... const resp = await fetch(`${this.baseUrl}/`)
   ```
   Adapt header access: `resp.headers.link` → `resp.headers.get('link')`.

3. Remove got and update engine:
   ```bash
   npm uninstall got
   ```
   Update `engines.node` from `>=14.21.2` to `>=18`.

### Files modified
- `package.json` — remove `got`, update `engines.node`
- `service/address-service.js` — replace `got.get()` with `fetch()`
- `test/js/drivers/AddressrRestDriver.js` — replace `got.extend()` pattern
- `test/js/drivers/AddressrRest2Driver.js` — replace `got` usage

### Testing
```bash
npm run build
npm test
```

---

## Phase 12: nyc + Cleanup (PR #12) — Low Risk, Small Effort

```bash
npm install --save-dev nyc@^18
npm uninstall babel-preset-env istanbul istanbul-middleware
```

Verify `babel-preset-env` (v1), `istanbul`, `istanbul-middleware` are not referenced anywhere before removing.

### Testing
```bash
npm run cover:nodejs:nogeo
```

---

## Phase 13: CI and Engine Updates (PR #13) — Low Risk, Small Effort

1. Update `engines.node` to `>=18` (if not done in Phase 11)
2. Update GitHub Actions versions:
   - `actions/checkout@v3` → `actions/checkout@v4`
   - `actions/setup-node@v3` → `actions/setup-node@v4`
3. Fix `.babelrc` — use explicit `"@babel/preset-env"` instead of `"env"` shorthand

### Files modified
- `package.json` — engine version
- `.github/workflows/release.yml` — action versions
- `.babelrc` — preset name

---

## Summary

| PR | Phase | Risk | Effort | Description |
|----|-------|------|--------|-------------|
| 1 | Semver-compatible updates | Low | Small | `npm update` for all in-range updates |
| 2 | Husky + lint-staged | Low | Small | Migrate to `.husky/` directory hooks |
| 3 | Prettier 3.x | Low | Medium | Upgrade + reformat codebase |
| 4 | ESLint overhaul | Medium | Large | v9 + replace deprecated plugins |
| 5 | Nodemon 3.x | Low | Small | Drop-in upgrade |
| 6 | js-yaml 4.x | Low | Small | `safeLoad` → `load` |
| 7 | Cucumber migration | Medium-High | Large | `cucumber` → `@cucumber/cucumber` |
| 8 | Prod deps (low-effort majors) | Medium | Medium | http-link-header, json-ptr, wait-port, uri-template-lite |
| 9 | keyv + keyv-file | Medium | Medium | Cache store API changes |
| 10 | Express 5.x | High | Large | Blocked by swagger-tools compatibility |
| 11 | Replace got with fetch | High | Medium | ESM-only blocker → use native fetch |
| 12 | nyc + cleanup | Low | Small | Remove deprecated deps |
| 13 | CI + engine updates | Low | Small | Action versions, .babelrc fix |

### Packages deliberately NOT upgraded
- **chai** — v5+ is ESM-only; stay on v4.5.0
- **ngrok** — v5 is beta; stay on v4.x
- **swagger-tools** — unmaintained, no drop-in replacement
- **npm-check** — superseded by `dry-aged-deps`

### Configuration

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
