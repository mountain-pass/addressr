import js from '@eslint/js';
import globals from 'globals';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import pluginSecurity from 'eslint-plugin-security';
import comments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import unicorn from 'eslint-plugin-unicorn';
import pluginPromise from 'eslint-plugin-promise';
import nodePlugin from 'eslint-plugin-n';
import { importX } from 'eslint-plugin-import-x';
import pluginChaiFriendly from 'eslint-plugin-chai-friendly';
import { globalIgnores } from 'eslint/config';

export default [
  // MUST be `globalIgnores()`, not a bare `{ ignores: [...] }` object. Under
  // ESLint 9 those were equivalent; under 10 the bare form no longer applies
  // globally, so `lib/**` fell back into scope and the transpiled build output
  // reported 2604 problems of its own — 78% of the tree-wide total, all noise.
  globalIgnores([
    'target/**',
    'coverage/**',
    'test-results/**',
    'lib/**',
    'scratchpad/**',
    '.env',
  ]),
  js.configs.recommended,
  pluginSecurity.configs.recommended,
  comments.recommended,
  unicorn.configs['flat/recommended'],
  pluginPromise.configs['flat/recommended'],
  nodePlugin.configs['flat/recommended-module'],
  importX.flatConfigs.recommended,
  importX.flatConfigs.warnings,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      // Default parser (espree). @babel/eslint-parser was needed only because
      // the source was compiled by Babel; the source is native ESM now, and
      // `requireConfigFile: false` existed purely to stop that parser hunting
      // for a .babelrc that no longer exists.
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        Promise: true,
      },
    },
    rules: {
      quotes: 'off',
      'no-console': 'off',
      'comma-dangle': 'off',
      strict: 2,
      'prettier/prettier': 'error',
      'import-x/default': 0,
      'unicorn/filename-case': [
        'error',
        {
          cases: {
            kebabCase: true,
            pascalCase: true,
          },
        },
      ],
      // Renamed from `unicorn/prevent-abbreviations` in unicorn 72. The old
      // name still resolves but its schema is gone, so passing these options
      // to it fails config validation outright rather than warning.
      //
      // `warn`, not `error`, and deliberately so — see the no-this-outside-of-class
      // note below. Raise back to `error` once the backlog is swept.
      'unicorn/name-replacements': [
        'warn',
        {
          replacements: {
            res: { response: true },
            dir: { directory: true },
          },
        },
      ],
      // The two rules unicorn 72 introduced that this codebase violates at
      // scale and that `--fix` cannot clear: 173 and 41 occurrences, concentrated
      // in service/ and src/. Enforcement here is the lint-staged pre-commit
      // hook, so leaving them at `error` would hard-block the next edit to any
      // of those files for a reason unrelated to that edit. `warn` keeps the
      // signal visible without making an 8-major dependency bump into a tax on
      // everyone's next commit. Raise per directory as the sweep lands.
      'unicorn/no-this-outside-of-class': 'warn',
      // ADR 005 (Babel/CJS) named this blocked; that ADR is superseded by ADR 044
      // and the source is native ESM, so the blocker is dead. Measured 2026-08-09
      // at `error` across the repo: zero violations. Enabled rather than
      // re-reasoned — a suppression whose stated blocker died and whose rule is
      // clean has nothing left holding it.
      'unicorn/prefer-module': 'error',
      // waycharter ops.find()/ops.filter() are not Array.prototype — false positives
      'unicorn/no-array-callback-reference': 'off',
      // NOT the ADR 005 Babel/CJS reason this line used to give — that blocker died
      // with ADR 044. Off for two remaining promise-chain process entry points,
      // measured 2026-08-09 and the only violations in the repo: `loader.js:40`
      // and `src/server2.js:37`, each the terminal `.catch(` of a top-level chain.
      // Converting them changes process startup, which is an entry-point change
      // and not a lint fix. Raise when they land. (The neighbouring inline
      // `unicorn/prefer-await` disables in those two files are a DIFFERENT rule;
      // this one needed its own reason and now has it.)
      'unicorn/prefer-top-level-await': 'off',
      'promise/always-return': 'warn',
      'promise/catch-or-return': 'warn',
      'n/no-unsupported-features/es-syntax': 'off',
      'n/no-unsupported-features/node-builtins': [
        'error',
        { ignores: ['fetch'] },
      ],
      'n/no-deprecated-api': 'warn',
      'no-process-exit': 'warn',
      'no-useless-assignment': 'off',
      complexity: 'warn',
      'max-lines-per-function': [
        'warn',
        { max: 100, skipBlankLines: true, skipComments: true },
      ],
      'max-depth': ['warn', 4],
      'max-params': ['warn', 4],
      // n/hashbang decides "does this file need a shebang?" by checking whether
      // package.json's `bin` names it. It used to need a convertPath mapping
      // bin/x.js -> lib/bin/x.js, because `bin` pointed into the Babel build
      // output. ADR-044 retired that build and `bin` now names these files
      // directly, so the mapping made both published entry points look
      // unpublished — and this rule's AUTOFIX REMOVES the shebang, with
      // lint-staged running `eslint --fix` on every staged *.js. Stripping it
      // breaks `addressr-server-2`, which is how the EB bundle starts the
      // server and how the quarterly loader cron invokes the published package.
      'n/hashbang': 'error',
    },
  },
  {
    files: ['test/**'],
    ...pluginChaiFriendly.configs.recommendedFlat,
    languageOptions: {
      globals: {
        expect: true,
      },
    },
  },
  {
    files: ['scripts/check-version.js'],
    rules: {
      // Load-bearing, do not remove: this file SHIPS (it is a package.json
      // `files` entry) and postinstall runs it through `sh`, but it is not a
      // `bin` entry — so n/hashbang classifies it as needing no shebang and its
      // autofix would strip one. The `parserOptions.sourceType: 'script'` that
      // used to sit alongside this is gone: the file is ESM, and ADR-044's
      // `"type": "module"` makes that unambiguous.
      'n/hashbang': 'off',
    },
  },
  {
    // Dagger CI runtime — modules resolved by Dagger SDK, not Node.js
    files: ['ci/**'],
    rules: {
      'import-x/no-unresolved': 'off',
      'n/no-missing-import': 'off',
    },
  },
  {
    // k6 load testing runtime — modules resolved by k6, not Node.js
    files: ['test/k6/**'],
    rules: {
      'import-x/no-unresolved': 'off',
      'n/no-missing-import': 'off',
    },
  },
  {
    // Deploy scripts — deps installed in deployment context, not dev
    files: ['deploy/**'],
    rules: {
      'n/no-missing-require': 'off',
    },
  },
];
