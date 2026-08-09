// @jtbd JTBD-400 (Ship Releases Reliably From Trunk)
//
// The geo tier selects geo scenarios — the floor its sibling cannot assert.
//
// WHY A SEPARATE FILE, which is the whole point and not a tidiness preference.
// `cucumber.js` computes its `--tags` expression inside `generateConfig`, and
// calls it three times AT MODULE SCOPE. The expression is therefore frozen
// against `process.env.ADDRESSR_ENABLE_GEO` as it stood at first import, for
// the life of the module registry. `cucumber-profiles.test.mjs` does
// `delete process.env.ADDRESSR_ENABLE_GEO` at module scope, so a geo floor
// added to that file would resolve against the CACHED nogeo expression and
// assert nothing about geo while reading as though it did — the same
// green-proves-nothing shape both files exist to catch. Node's test runner
// gives each file its own process, which is what makes a separate file a real
// fix rather than a cosmetic one.
//
// That reasoning is itself a belief about module caching, so it is not left as
// a comment: the first assertion below EVALUATES BOTH BRANCHES and requires
// them to differ. If the geo flag ever stops reaching the tag expression, that
// assertion reddens here rather than quietly hollowing out the floor.
//
// WHAT THIS ADDS OVER THE SIBLING'S `> 0` FLOOR. That floor runs with geo off
// and would stay green if the geo branch selected nothing, or selected exactly
// the nogeo set. P094's actual defect was a geo tier that ran and reported
// scenarios while exercising nothing geo-specific. So `> 0` is necessary and
// not sufficient; the load-bearing assertion is the SET DIFFERENCE — geo must
// select scenarios that nogeo does not.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

// Same engine gate and same reason as cucumber-profiles.test.mjs:
// `@cucumber/cucumber/api` reaches its config loader through CommonJS that
// `require()`s ESM, which needs Node >=22.12. On the 22.7 engine floor it
// throws before any assertion runs. Recorded on P094.
const [major, minor] = process.versions.node.split('.').map(Number);
const IS_REQUIRE_ESM_AVAILABLE = major > 22 || (major === 22 && minor >= 12);

const cwd = fileURLToPath(new URL('../../../', import.meta.url));
const configUrl = new URL('../../../cucumber.js', import.meta.url).href;

// Explicit for the same reason the sibling is: the ambient environment of
// whoever runs this must not decide what is asserted. CUCUMBER_IGNORE_RERUN
// takes the full feature glob rather than gitignored leftover rerun state.
process.env.CUCUMBER_IGNORE_RERUN = '1';
delete process.env.ADDRESSR_ENABLE_GEO;

const environment = {
  ES_INDEX_NAME: 'test-geo',
  COVERED_STATES: 'OT',
  CUCUMBER_IGNORE_RERUN: '1',
  ADDRESSR_ENABLE_GEO: '1',
};

const logger = { debug() {}, warn() {}, error() {} };

/**
 * Import `cucumber.js` fresh, with the geo flag set as asked.
 *
 * The query string is a cache-buster, not decoration: a plain re-import returns
 * the first evaluation's frozen config strings, which is precisely the trap
 * this file was split out to avoid.
 */
const importConfigFresh = async (geo, cacheKey) => {
  if (geo) process.env.ADDRESSR_ENABLE_GEO = '1';
  else delete process.env.ADDRESSR_ENABLE_GEO;
  // cucumber.js logs its resolved config on evaluation; keep it out of the
  // test reporter's output without suppressing anything a failure would need.
  const log = console.log;
  console.log = () => {};
  try {
    return await import(`${configUrl}?${cacheKey}`);
  } finally {
    console.log = log;
  }
};

const tagsOf = (configString) =>
  /--tags '([^']*)'/.exec(configString)?.[1] ?? configString;

describe('geo tag selection (P094)', () => {
  it('ADDRESSR_ENABLE_GEO actually changes the resolved tag expression', () => {
    // Load-bearing precondition for everything below. If the flag stopped
    // reaching the expression — because the read moved, or because a stale
    // module was served — every later assertion would still pass while
    // asserting the nogeo tier twice.
    return (async () => {
      const nogeo = await importConfigFresh(false, 'geo=0');
      const geo = await importConfigFresh(true, 'geo=1');

      const nogeoTags = tagsOf(nogeo.cli2);
      const geoTags = tagsOf(geo.cli2);

      assert.notEqual(
        geoTags,
        nogeoTags,
        'the geo flag did not change the tag expression — either the module was served from cache, or the flag is no longer read at evaluation time. Every geo assertion downstream is hollow until this passes.',
      );
      assert.match(
        nogeoTags,
        /not\(@geo\)/,
        'with the flag off, geo scenarios must be excluded',
      );
      assert.match(
        geoTags,
        /not\(@not-geo\)/,
        'with the flag on, the exclusion must flip to @not-geo',
      );
    })();
  });
});

describe(
  'the geo tier selects geo-specific scenarios (P094)',
  {
    skip: IS_REQUIRE_ESM_AVAILABLE
      ? false
      : `needs Node >=22.12 for require(esm); running ${process.versions.node}`,
  },
  () => {
    // Resolved once through cucumber's own loader, then filtered twice through
    // cucumber's own gherkin parse and tag filter. Both expressions come from
    // `cucumber.js`'s two branches, so neither side is a model of the rule.
    const resolveGeo = async () => {
      process.env.ADDRESSR_ENABLE_GEO = '1';
      const { loadConfiguration, loadSources } =
        await import('@cucumber/cucumber/api');
      const { runConfiguration } = await loadConfiguration(
        { file: 'cucumber.js', profiles: ['cli2'] },
        { cwd, env: environment, logger },
      );
      return { sources: runConfiguration.sources, loadSources };
    };

    const namesFor = async (loadSources, sources, tagExpression) => {
      const { plan } = await loadSources({ ...sources, tagExpression });
      return new Set(plan.map((p) => `${p.uri}:${p.location.line} ${p.name}`));
    };

    it('selects at least one scenario with geo enabled', async () => {
      // A floor, deliberately not a count. Pinning 34 rots by the next scenario
      // added, which is the failure P033 catalogues.
      const { sources, loadSources } = await resolveGeo();
      const { plan } = await loadSources(sources);
      assert.ok(
        plan.length > 0,
        'the geo profile selected no scenarios. `npm run test:geo` would report 0 and exit 0 — a gate that passes by running nothing.',
      );
    });

    it('selects scenarios the nogeo tier does NOT, so the tier is not a duplicate run', async () => {
      // THE ASSERTION THAT MATTERS. P094's defect was a geo leg that ran, went
      // green, and exercised nothing geo-specific. A tier whose selection is a
      // subset of the nogeo tier's is exactly that: cost with no coverage, and
      // `release.yml` now blocks publish on it.
      const { sources, loadSources } = await resolveGeo();
      const geoTags = sources.tagExpression;
      const nogeoTags = geoTags.replace('not(@not-geo)', 'not(@geo)');
      assert.notEqual(
        nogeoTags,
        geoTags,
        'could not derive the nogeo expression from the geo one — the tag construction in cucumber.js changed shape',
      );

      const geoNames = await namesFor(loadSources, sources, geoTags);
      const nogeoNames = await namesFor(loadSources, sources, nogeoTags);
      const onlyGeo = [...geoNames].filter((n) => !nogeoNames.has(n));

      assert.ok(
        onlyGeo.length > 0,
        `the geo tier selected ${geoNames.size} scenarios, every one of which the nogeo tier also runs. The geo leg is duplicating the nogeo leg and proving nothing geo-specific — check that @geo tags still exist in test/resources/features.`,
      );
    });
  },
);
