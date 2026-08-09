// @jtbd JTBD-400 (Ship Releases Reliably From Trunk)
//
// The cucumber profile map has a silent-green failure mode, and it fired during
// the native-ESM migration (ADR-044).
//
// Under CommonJS the config was `module.exports = { default, rest2, cli2 }` and
// cucumber read that object as the PROFILE MAP. Under ESM it reads the default
// export as the default profile's own options, and takes every other profile
// from a NAMED export. Leave the CommonJS shape in place and:
//
//   -p rest2    errors honestly, "Requested profile doesn't exist"
//   -p default  matches cucumber's own built-in empty default and reports
//               0 scenarios / 0 steps, EXIT 0
//
// A green run that executed nothing. All three profiles reported 0 while
// exiting 0 until the export shape was corrected, and the only thing that
// caught it was noticing the counts had changed — a comparison that lived in a
// person's head, not in the pipeline. This file is that comparison, mechanised.
//
// THE ORACLE IS CUCUMBER'S OWN RESOLVER, NOT A MODEL OF IT. The first draft
// asserted the module's export shape — default export is a string, rest2 and
// cli2 are named exports. That passes at the artefact level (those exports ARE
// what cucumber reads) but it is weak at the oracle level: it restates the same
// belief about cucumber's profile-resolution rule that was wrong in the first
// place, so it cannot detect that belief being wrong again. `loadConfiguration`
// is the function that actually resolves a profile, it is exported from
// `@cucumber/cucumber/api`, and asserting on its OUTPUT tests the outcome
// instead of the theory. The trap itself lives in
// node_modules/@cucumber/cucumber/lib/configuration/from_file.js: no usable
// default profile silently becomes `definitions.default = {}`, which merges to
// `paths: []`, which is zero scenarios and exit 0.
//
// AND A FLOOR, WHICH IS NOT A COUNT. Pinning 37/38/33 would rot — a number
// nobody trusts by the third scenario added, which is exactly the failure P033
// catalogues. `> 0` does not rot: a profile that selects zero scenarios is
// always a bug, and the floor catches a second route to the same silent green
// that the export shape cannot see. `cucumber.js` builds `--tags` by string
// concatenation with hand-managed quoting, so a quoting slip, or `@rest2` being
// renamed in the feature files, selects nothing with a perfectly correct export
// shape.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

// SKIPPED BELOW NODE 22.12, and the reason is cucumber's, not ours.
// `@cucumber/cucumber/api` reaches `loadConfiguration` through
// `lib/configuration/argv_parser.js`, which is CommonJS and `require()`s
// `@cucumber/gherkin`, which is ESM. That only works from Node 22.12, where
// `require(esm)` was unflagged. On 22.7 — the version the `engine-floor` job
// pins as the declared floor — it throws ERR_REQUIRE_ESM before any assertion
// runs.
//
// Skipping rather than weakening: the alternative is to assert the config
// module's export shape instead, which restates the belief that was wrong in
// the first place and cannot detect it being wrong again. Better to run the
// real oracle where it can run than a weaker one everywhere.
//
// This is worth knowing beyond this file: if cucumber-js 13 cannot load its own
// configuration on 22.7, the `engines: ">=22"` floor may be wrong. Nothing else
// tests cucumber on 22.7 — `engine-floor` runs `test:js` only. Recorded on P094.
const [major, minor] = process.versions.node.split('.').map(Number);
const IS_REQUIRE_ESM_AVAILABLE = major > 22 || (major === 22 && minor >= 12);

const PROFILES = ['default', 'rest2', 'cli2'];

const cwd = fileURLToPath(new URL('../../../', import.meta.url));

// Explicit, not inherited, for two reasons that would each make this file a
// false-red generator in the pre-commit hook.
//
// ADDRESSR_ENABLE_GEO flips the tag expression, so the ambient environment of
// whoever runs this must not decide what is asserted.
//
// CUCUMBER_IGNORE_RERUN takes the full feature glob rather than the rerun file.
// `cucumber.js` swaps the glob for `@cucumber-<profile>.rerun` when that file is
// non-empty — and `--dry-run` writes it, listing every scenario it skipped. So
// after any local cucumber run, gitignored leftover state would decide what this
// test resolves. Measured: it was doing exactly that when this file was written.
const environment = {
  ES_INDEX_NAME: 'test',
  COVERED_STATES: 'OT',
  CUCUMBER_IGNORE_RERUN: '1',
};

// `cucumber.js` reads process.env at module-evaluation time, so the env passed
// to loadConfiguration below does not reach it. Set it here as well.
process.env.CUCUMBER_IGNORE_RERUN = '1';
delete process.env.ADDRESSR_ENABLE_GEO;

/** Silence cucumber's own logger so a debug line does not land in test output. */
const logger = { debug() {}, warn() {}, error() {} };

const resolve = async (profile) => {
  const { loadConfiguration } = await import('@cucumber/cucumber/api');
  return loadConfiguration(
    { file: 'cucumber.js', profiles: profile === 'default' ? [] : [profile] },
    { cwd, env: environment, logger },
  );
};

describe(
  'cucumber profile resolution — cucumber resolving it, not us (ADR-044)',
  {
    skip: IS_REQUIRE_ESM_AVAILABLE
      ? false
      : `needs Node >=22.12 for require(esm); running ${process.versions.node}`,
  },
  () => {
    for (const profile of PROFILES) {
      it(`${profile} resolves to a profile that exists and carries sources`, async () => {
        // A missing named export throws here rather than silently yielding the
        // empty built-in — except for `default`, which is the trap: it resolves
        // successfully to an EMPTY config. So assert the contents, not the call.
        const { useConfiguration } = await resolve(profile);
        assert.ok(
          useConfiguration.paths.length > 0,
          `${profile} resolved with no feature paths — this is the shape that reports 0 scenarios and exits 0`,
        );
        assert.ok(
          useConfiguration.import.length > 0,
          `${profile} imports no step definitions; every scenario would be undefined and, under --no-strict, the run would still exit 0`,
        );
      });

      it(`${profile} loads step definitions with --import, never --require`, async () => {
        // `--require` loads through CommonJS. Against native-ESM step definitions
        // it does not error — it finds nothing, and the run reports zero
        // scenarios, green. This is the specific regression that would undo the
        // migration's coverage without reddening anything.
        const { useConfiguration } = await resolve(profile);
        assert.deepStrictEqual(
          useConfiguration.require,
          [],
          `${profile} must not use --require: it silently loads nothing from ESM step definitions`,
        );
      });

      it(`${profile} selects at least one scenario`, async () => {
        // The floor. Uses cucumber's own gherkin parse and tag filter — no
        // OpenSearch, no server, no step execution, just the pickle plan.
        const { runConfiguration } = await resolve(profile);
        const { loadSources } = await import('@cucumber/cucumber/api');
        const { plan } = await loadSources(runConfiguration.sources);
        assert.ok(
          plan.length > 0,
          `${profile} selected no scenarios. Either the tag expression stopped matching (it is built by string concatenation with hand-managed quoting) or the feature glob is wrong. Both report 0 scenarios and exit 0.`,
        );
      });
    }

    it('keeps the three profiles distinct, so one cannot shadow another', async () => {
      // A copy-paste pointing two profiles at the same tag expression would run
      // one tier twice and report the other as covered.
      const tags = await Promise.all(
        PROFILES.map(async (p) => (await resolve(p)).useConfiguration.tags),
      );
      assert.equal(
        new Set(tags).size,
        PROFILES.length,
        `two profiles resolve to the same tag expression: ${tags.join(' | ')}`,
      );
    });
  },
);
