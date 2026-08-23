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
    // ADR-053 phase 1. This config has no TypeScript parser and no JSX settings,
    // so .tsx would go unlinted while stray .js/.jsx collected eslint-plugin-n
    // recommended-module and unicorn/filename-case findings that fight React
    // convention. Adding typescript-eslint and jsx-a11y is real work with its own
    // decisions; jsx-a11y is the obvious later addition given this repo's
    // accessibility-first posture, so the omission is sequencing, not oversight.
    //
    // Inside globalIgnores rather than a new top-level block, deliberately: a new
    // block would make 17 entries and falsify ADR-014's Confirmation, which pins 16.
    // This form also fails LOUD if apps/website ever moves — findings appear on
    // staged files rather than an autofix quietly mutating something.
    'apps/website/**',
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
    // GLOB WIDENED 2026-08-10, and it is the root cause of a production-red
    // outage rather than tidiness. This read `['scripts/check-version.js']`,
    // which in flat config anchors to the config's base directory. When the
    // workspace split moved the file to `packages/addressr/scripts/`, the
    // override stopped matching, `n/hashbang` went live on it, and the next
    // `eslint . --fix` STRIPPED the shebang the comment below exists to
    // protect. `npm ci` then handed the file to `sh` — "import: not found" —
    // and every job on master went red. A path-anchored exemption for a file
    // that can move is a guard with an expiry date nobody sees.
    files: ['**/scripts/check-version.js'],
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
    // NAME-anchored on the directory basename, not on a repo path, matching
    // the cloudflare-worker block below and for the same reason: two
    // path-anchored blocks in this file died on 2026-08-10 when their trees
    // moved. This one would fail loudly rather than silently — `no-undef` has
    // no autofix — but "loudly" only reaches someone who STAGES a k6 file, and
    // that is exactly the mechanism that hid these three usages from the day
    // the rule landed until 2026-08-19. With a tree-wide sweep prohibited,
    // deferred-loud on this surface is closer to silent than it looks.
    files: ['**/k6/**'],
    languageOptions: {
      globals: {
        // k6 runtime globals. Injected by the k6 VM, not importable, so
        // without these `no-undef` reports them as typos.
        //
        // These went unreported until 2026-08-19 not because the config was
        // right but because lint-staged only lints STAGED files and no k6
        // script had been touched since the rule landed. The first commit to
        // edit one failed the hook on three pre-existing usages. Declared
        // rather than silenced: `no-undef` off for this tree would also stop
        // catching a real typo.
        __ENV: 'readonly',
        __VU: 'readonly',
        __ITER: 'readonly',
      },
    },
    rules: {
      'import-x/no-unresolved': 'off',
      'n/no-missing-import': 'off',
    },
  },
  {
    // Cloudflare Worker sources. NAME-anchored on the directory basename, not
    // on a repo path, and that is load-bearing: this tree moved twice on
    // 2026-08-10 (deploy/ -> packages/deployment -> apps/addressr-deployment).
    // A path-anchored block would go silent on the third move with no error and
    // no diff — the failure that killed the `deploy/**` block below and the
    // n/hashbang exemption whose death stripped a shebang and reddened every CI
    // job (5327a929).
    files: ['**/cloudflare-worker/**'],
    rules: {
      // NARROWED, not disabled, mirroring the `{ ignores: ['fetch'] }` form
      // already used above — the rest of the rule stays live here.
      //
      // PERMANENT, because the rule is wrong for this file set rather than
      // deferred debt: `Response`, `Request` and `Headers` are Cloudflare
      // Workers RUNTIME GLOBALS. This code never executes on Node, so flagging
      // them against the `>=16.0.0` engines range is a false positive by
      // construction, not a version-support gap that will age out.
      //
      // `test`, `test.describe` and `test.it` are a DIFFERENT case in the same
      // list: they are real node:test usage in worker.test.js, flagged only
      // because the engines floor is 16 while the suite runs on 22+. Kept here
      // rather than fixed because worker.test.js is currently ORPHANED — no
      // runner globs it (`test:js` matches test/js/__tests__/*.test.mjs only),
      // so its assertions have never executed. Wiring it up is the real fix and
      // belongs with ADR-032's confirmation criterion 4, not in a rename commit.
      'n/no-unsupported-features/node-builtins': [
        'error',
        {
          ignores: [
            // `fetch` is carried over from the repo-wide narrowing above. It is
            // NOT redundant: a later flat-config block replaces the rule options
            // for its matched files rather than merging with them, so omitting
            // it here re-enables the error for the worker only — which is how
            // this list was first found one entry short.
            'fetch',
            'Response',
            'Request',
            'Headers',
            'test',
            'test.describe',
            'test.it',
          ],
        },
      ],
      // DEFERRED, not wrong — flagged separately from the above on purpose, so
      // a permanent exemption and a sequencing deferral are not indistinguishable
      // in this file. `new Request(url.toString(), …)` at worker.js:65 would
      // become `url.href`, which is behaviour-identical for a URL. It is not
      // changed here because this is a directory-rename commit and the file sits
      // on the ADR-018 / ADR-024 origin-auth boundary; it goes with the commit
      // that wires up worker.test.js. Tracked under P084.
      'unicorn/prefer-url-href': 'off',
    },
  },

  // REMOVED 2026-08-10: a `files: ['deploy/**']` block turning off
  // `n/no-missing-require`. `deploy/` stopped existing at bf106786, so the block
  // had been dead for a day — the second path-anchored config entry to go silent
  // in that commit, alongside the `n/hashbang` exemption whose death stripped a
  // shebang and reddened every CI job (fixed at 5327a929 by name-anchoring).
  // This one was quieter only because `n/no-missing-require` going live emits a
  // lint error rather than an autofix that mutates a file.
  //
  // Deleted rather than repointed at apps/addressr-deployment/**. The tree is
  // native ESM (ADR-044) and carries no `require(` call, so the exemption is
  // inert; repointing it would restore a rule that reads as protection, protects
  // nothing, and acquires a fresh expiry date at the next move.
];
