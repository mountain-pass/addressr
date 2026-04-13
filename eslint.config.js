import js from '@eslint/js';
import globals from 'globals';
import babelParser from '@babel/eslint-parser';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import pluginSecurity from 'eslint-plugin-security';
import comments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import pluginUnicorn from 'eslint-plugin-unicorn';
import pluginPromise from 'eslint-plugin-promise';
import nodePlugin from 'eslint-plugin-n';
import { importX } from 'eslint-plugin-import-x';
import pluginChaiFriendly from 'eslint-plugin-chai-friendly';

export default [
  {
    ignores: [
      'nodemodules/**/*',
      'target/**/*',
      'coverage/**',
      'test-results/**',
      'lib/**/*',
      '.env',
    ],
  },
  js.configs.recommended,
  pluginSecurity.configs.recommended,
  comments.recommended,
  pluginUnicorn.configs['flat/recommended'],
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
        'warn',
        {
          cases: {
            kebabCase: true,
            pascalCase: true,
          },
        },
      ],
      'unicorn/prevent-abbreviations': 'warn',
      'unicorn/no-null': 'warn',
      'unicorn/no-process-exit': 'warn',
      'unicorn/prefer-module': 'off',
      // waycharter ops.find()/ops.filter() are not Array.prototype — false positives
      'unicorn/no-array-callback-reference': 'off',
      'unicorn/prefer-spread': 'off',
      'unicorn/prefer-top-level-await': 'off',
      'unicorn/prefer-global-this': 'off',
      'unicorn/require-module-specifiers': 'off',
      'unicorn/prefer-string-raw': 'off',
      'unicorn/no-anonymous-default-export': 'off',
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
      'n/hashbang': [
        'error',
        {
          convertPath: {
            'bin/**/*.js': ['^bin/(.+?)\\.js$', 'lib/bin/$1.js'],
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
];
