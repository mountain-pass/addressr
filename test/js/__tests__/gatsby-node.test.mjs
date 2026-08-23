// apps/website/gatsby-node.js — the build-html null-loader rules.
// swagger-ui stays; auth0-js goes.
//
// FILENAME IS LOAD-BEARING. It is `gatsby-node.test.mjs` so the TDD gate can
// associate it with apps/website/gatsby-node.js — the matcher pairs an
// implementation file with `<stem>.test.*` under a `__tests__/` directory. It
// lives here rather than beside the source so it is inside the suite glob
// (`test/js/__tests__/*.test.mjs`) and actually RUNS; co-located under
// apps/website it would satisfy the gate and never execute, which is the
// dead-test class this repo already tracks.
//
// WHY THIS EXISTS. `apps/website/gatsby-node.js` null-loads modules that touch
// browser-only APIs during Gatsby's SSR pass. Two rules lived there; only one
// was ever needed.
//
// THE TRAP THIS GUARDS. `api-docs.js` has its `swagger-ui` import COMMENTED OUT
// at :5 and reaches `window.SwaggerUI` at :10 instead. So the import looks
// unused, and the obvious tidy — drop the rule, nothing imports it — breaks the
// SSR build of a page that serves 200 on the evaluation path (JTBD-004). The
// rule is load-bearing precisely because the thing that makes it look redundant
// is a comment. A reader cannot see that from `gatsby-node.js` alone.
//
// The `auth0-js` rule beside it was the opposite case: `auth0-js` is not a
// dependency, nothing under `src/` references it, and its comment pointed at
// `src/utils/auth.js`, which does not exist. It stubbed out a package that was
// never there, and it was removed at the ADR-053 import with the other Auth0
// remnants.
//
// BEHAVIOURAL, not source-inspection: this calls the real exported hook with a
// real stage and reads the config it produces, so it fails if the rule stops
// being APPLIED — not merely if the text changes.
//
// @adr ADR-053 (website imported as an app with hosting unchanged)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../',
);
const GATSBY_NODE = path.join(repoRoot, 'apps/website/gatsby-node.js');

/** Drive the real hook and return the rules it sets for the SSR pass. */
const rulesForBuildHtml = () => {
  // CJS by design — apps/website declares "type": "commonjs" because Gatsby's
  // config files are CJS while the repo root is ESM.
  const require = createRequire(import.meta.url);
  delete require.cache[require.resolve(GATSBY_NODE)];
  const gatsbyNode = require(GATSBY_NODE);

  let captured;
  gatsbyNode.onCreateWebpackConfig({
    stage: 'build-html',
    loaders: { null: () => 'null-loader' },
    actions: {
      setWebpackConfig: (cfg) => {
        captured = cfg;
      },
    },
  });
  return captured?.module?.rules ?? [];
};

const matches = (rules, source) =>
  rules.filter((r) => r?.test instanceof RegExp && r.test.test(source));

describe('apps/website build-html null loaders', () => {
  it('the hook exists and sets rules, so a zero-match pass is impossible', () => {
    assert.ok(existsSync(GATSBY_NODE), 'apps/website/gatsby-node.js is missing');
    assert.ok(
      rulesForBuildHtml().length > 0,
      'onCreateWebpackConfig set no rules for stage build-html — the assertions ' +
        'below would pass having examined nothing',
    );
  });

  it('null-loads swagger-ui — removing this breaks the /api-docs/ SSR build', () => {
    assert.equal(
      matches(rulesForBuildHtml(), 'node_modules/swagger-ui/dist/index.js').length,
      1,
      'the swagger-ui null-loader rule is gone. api-docs.js reaches ' +
        'window.SwaggerUI at :10 even though its import is commented at :5, so ' +
        'the SSR pass needs this rule regardless of how the imports read.',
    );
  });

  it('does NOT null-load auth0-js — the package is not a dependency', () => {
    assert.deepEqual(
      matches(rulesForBuildHtml(), 'node_modules/auth0-js/dist/auth0.js').map(String),
      [],
      'an auth0-js null-loader rule is present. auth0-js is not in ' +
        'apps/website/package.json and nothing under src/ imports it; the rule ' +
        'stubs out a package that is not there.',
    );
  });

  it('applies no rules outside the SSR pass', () => {
    const require = createRequire(import.meta.url);
    delete require.cache[require.resolve(GATSBY_NODE)];
    let called = false;
    require(GATSBY_NODE).onCreateWebpackConfig({
      stage: 'develop',
      loaders: { null: () => 'null-loader' },
      actions: {
        setWebpackConfig: () => {
          called = true;
        },
      },
    });
    assert.equal(called, false, 'null loaders leaked outside build-html');
  });
});
