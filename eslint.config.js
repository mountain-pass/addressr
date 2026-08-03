import js from '@eslint/js';
import globals from 'globals';
import babelParser from '@babel/eslint-parser';
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
      parser: babelParser,
      parserOptions: {
        sourceType: 'module',
        requireConfigFile: false,
      },
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
      // Blocked by ADR 005 (Babel/CJS — requires native ESM)
      'unicorn/prefer-module': 'off',
      // waycharter ops.find()/ops.filter() are not Array.prototype — false positives
      'unicorn/no-array-callback-reference': 'off',
      // Blocked by ADR 005 (Babel/CJS — requires native ESM)
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
      'n/hashbang': [
        'error',
        {
          convertPath: {
            'bin/**/*.js': [String.raw`^bin/(.+?)\.js$`, 'lib/bin/$1.js'],
          },
        },
      ],
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
    languageOptions: {
      parserOptions: {
        sourceType: 'script',
      },
    },
    rules: {
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
