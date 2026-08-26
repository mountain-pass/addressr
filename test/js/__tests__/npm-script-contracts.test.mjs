// @jtbd JTBD-400 (Ship Releases Reliably From Trunk)
//
// Contracts between npm scripts that nothing else can see.
//
// WHY THIS EXISTS (P094). `start:server2:preinstalled` is shared by the nogeo
// and geo packaged-test chains. It used to hardcode `ES_INDEX_NAME=test`, which
// made it covertly nogeo-specific: the geo chain's loader wrote `test-geo` while
// the server it started read `test`. The hardcode is gone and the script now
// inherits from its caller — a contract held together by agreement between
// several independent script strings, where re-pinning it is a one-word edit
// that looks harmless.
//
// WHY IT IS A TEST AND NOT A COMMENT. `waitport` (test/js/world.js) waits on the
// TCP port only and cannot observe a server pointed at the wrong index. So a
// re-pin does not error: the geo leg serves `test`, which the nogeo chain has
// already populated with non-geo data, and the run goes green having exercised
// nothing geo-specific at the server. `release.yml` now gates publish-and-deploy
// on that leg, so a green-but-hollow run is worse than the gap it replaced.
//
// WHY THIS IS NOT SOURCE INSPECTION (P033). The carve-out this repo has settled
// is not "static facts are fair game" — `assert.match(/fuzziness: "AUTO:5,8"/)`
// is a static fact too, and it is P033's own worked example. What licenses this
// is that THE CONSUMER OF THESE STRINGS IS AN INTERPRETER, NOT A HUMAN READING
// INTENT: a `scripts` value is the input `sh` executes, exactly as an import
// specifier is what Node resolves and a workflow `if:` is what GitHub evaluates.
//
// But the license is not the standard. Every sibling that took it then used the
// strongest available oracle rather than the weakest one permitted — the
// workflow test parses YAML, cucumber-profiles calls cucumber's own resolver,
// package-graph-ships uses esbuild. So this parses the JSON and then models sh's
// PREFIX-ASSIGNMENT RULE rather than grepping for characters: a bare
// /ES_INDEX_NAME=(\S+)/ would match inside a DEBUG value, a run-p target name,
// or a future echo.
//
// LIMITS, stated because a hand-rolled interpreter is the half that has bitten
// this repo twice, and because a file whose name says "contracts" should not
// imply more than it holds:
//
//   1. sh model — only the leading `VAR=value` run is read. A variable set via
//      `export ... &&`, through an indirection, or after the command word is
//      invisible here.
//   2. Runtime — this guards DECLARATION drift. Nothing observes the running
//      server's index, because `waitport` is port-only. The stronger guard is a
//      behavioural precondition in the cli2 driver (assert a known OT document
//      is retrievable once the port opens). Uncovered and enumerated on P094.
//      What makes the residue tolerable is that client/elasticsearch.js now
//      THROWS under TEST_PROFILE rather than resolving silently to `addressr`.
//   3. The ADR-009 link assertion below is a PRESENCE-OF-NAME check, not a
//      rationale-exists check: it reddens on a benign reword and passes on a
//      section that names a script while saying nothing useful about it. Kept
//      because it is cheap and directionally right; the inverse assertion (an
//      exception listed for a since-wired script) is the half that truly binds.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (relative) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

const { scripts } = JSON.parse(read('../../../package.json'));

/**
 * The environment a script sets via sh's leading prefix-assignment run.
 *
 * Models the rule rather than the characters: `VAR=value` pairs are only
 * assignments while they precede the command word. Everything after the first
 * token that is not an assignment is arguments, and is not read.
 */
const prefixEnvironment = (command = '') => {
  const environment = {};
  // Consumed from the head rather than by splitting on whitespace, because the
  // value this most needs to read — NO_STRICT=' ' — CONTAINS a space. A
  // split-on-whitespace tokeniser reads that as two words and silently returns
  // a truncated `'`, which is the failure this file's own header warns about.
  // Values are kept RAW, quotes included: the quoting is the contract here, not
  // an artefact to normalise away.
  let rest = command.trim();
  for (;;) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=('[^']*'|"[^"]*"|\S*)\s*/.exec(
      rest,
    );
    if (!match) break;
    environment[match[1]] = match[2];
    rest = rest.slice(match[0].length);
  }
  return environment;
};

/** Every `VAR=value` anywhere in a command — for chains like `a && VAR=x b`. */
const allAssignments = (command = '', name) =>
  [...command.matchAll(new RegExp(String.raw`(?:^|\s)${name}=(\S*)`, 'g'))].map(
    (m) => m[1],
  );

/** Every test script reachable from `npm test`, followed transitively. */
const reachableFromNpmTest = () => {
  const walk = (key, seen = new Set()) => {
    if (seen.has(key)) return seen;
    seen.add(key);
    for (const [, reference] of (scripts[key] ?? '').matchAll(
      /(?:^|\s)((?:pre|post|do)?test:[a-zA-Z0-9:]+)/g,
    ))
      walk(reference, seen);
    return seen;
  };
  return walk('test');
};

const INHERITS_INDEX = 'start:server2:preinstalled';
const CALLERS = ['test:cli2:nogeo', 'test:cli2:geo'];

// DELIBERATELY LOOSE (`test:<anything>:<mode>`), not `test:[^:]+:<mode>`.
//
// A strict pattern would put `test:nodejs:QLD:{geo,nogeo}` outside the guard
// entirely — silently, which is the same in-no-chain shape P094 was filed for.
// Loose keeps the guard's scope visible: anything matching is either wired or
// named below with a reason.
const TIER_SCRIPT = /^test:.+:(?:geo|nogeo)$/;

/**
 * Declared tier scripts deliberately not in the `npm test` chain.
 *
 * Each MUST be named in ADR-009's amendment — asserted below, so the exception
 * and its rationale cannot rot apart.
 */
const EXCEPTED = new Set([
  'test:rest2:geo',
  'test:nodejs:QLD:nogeo',
  'test:nodejs:QLD:geo',
]);

const ADR_009 = '../../../docs/decisions/009-cucumber-bdd-testing.accepted.md';

describe('npm script contracts — the packaged-test index name (P094)', () => {
  it(`${INHERITS_INDEX} pins no index, so it is not covertly nogeo-specific`, () => {
    assert.equal(
      prefixEnvironment(scripts[INHERITS_INDEX]).ES_INDEX_NAME,
      undefined,
      `${INHERITS_INDEX} must inherit ES_INDEX_NAME from its caller. Pinning it here serves the geo chain from the nogeo chain's index, and waitport cannot see that.`,
    );
  });

  for (const caller of CALLERS) {
    it(`${caller} sets the index itself, since the server no longer supplies one`, () => {
      // Load-bearing, not belt-and-braces: with the hardcode removed, a caller
      // that omits this does not fail. It used to resolve to `addressr` — the
      // PRODUCTION index name. client/elasticsearch.js now throws under
      // TEST_PROFILE instead, which is what makes that edge loud.
      assert.ok(
        prefixEnvironment(scripts[caller]).ES_INDEX_NAME,
        `${caller} starts ${INHERITS_INDEX}, which pins nothing — so this script must set ES_INDEX_NAME.`,
      );
    });
  }

  it('every geo script agrees on ONE index, derived rather than enumerated', () => {
    // Derived from the script names so a drift in a site this test does not
    // know about still fails. Enumerating the three cli2 sites would miss
    // pretest:nodejs:geo, which names the same index.
    const geoScripts = Object.keys(scripts).filter((k) =>
      /^(?:pre|do)?test:[a-z0-9]+:geo$/.test(k),
    );
    assert.ok(
      geoScripts.length >= 4,
      `expected several geo scripts, found ${geoScripts.length}`,
    );
    const named = geoScripts
      .map((k) => [k, allAssignments(scripts[k], 'ES_INDEX_NAME')])
      .filter(([, v]) => v.length > 0);
    const distinct = new Set(named.flatMap(([, v]) => v));
    assert.equal(
      distinct.size,
      1,
      `the geo scripts disagree about their index: ${named.map(([k, v]) => `${k}=${v.join('/')}`).join(', ')}`,
    );
  });

  it('the geo chain does not share an index with the nogeo chain', () => {
    // They run serially under `npm test`. Sharing means the geo loader writes
    // over the nogeo leg's data, or serves its leftovers.
    assert.notEqual(
      prefixEnvironment(scripts['dotest:cli2:geo']).ES_INDEX_NAME,
      prefixEnvironment(scripts['test:cli2:nogeo']).ES_INDEX_NAME,
    );
  });
});

describe('npm script contracts — the pre-publish geo gate (P094)', () => {
  it('test:geo runs the packaged leg, not just the source leg', () => {
    // The wiring itself. release.yml's build-and-test runs `npm run test:geo`
    // and `release` holds on it, so the published-package-plus-geo diagonal —
    // the configuration production actually runs — is a gate only for as long
    // as this line names it.
    assert.match(scripts['test:geo'], /\btest:cli2:geo\b/);
    assert.match(scripts['test:geo'], /\btest:nodejs:geo\b/);
  });

  it('runs the cheap source leg before the expensive packaged one', () => {
    // Relational, never an exact-string pin: ADR-009 contemplates adding
    // profiles, and an equality assertion would red the suite on a legitimate
    // addition with no behaviour change. Fail-fast, and the cli2 leg mutates
    // the runner's global prefix via `npm install -g`, so it belongs last.
    const geo = scripts['test:geo'];
    assert.ok(geo.indexOf('test:nodejs:geo') < geo.indexOf('test:cli2:geo'));
  });

  it("runs the geo chain in STRICT mode, pinned to the exact literal ' '", () => {
    // cucumber.js defaults NO_STRICT to '--no-strict' and substitutes the value
    // directly into argv. So the literal single space is not a typo: it
    // substitutes to nothing, leaving cucumber strict. `NO_STRICT=1` would
    // inject a bare `1` that cucumber reads as a FEATURE PATH. Do not "tidy"
    // this to a truthy value.
    //
    // Without strictness, undefined and pending steps do not fail — which is
    // how a 34-scenario green run can prove less than it appears to. That
    // happened here, before the wiring landed.
    assert.equal(prefixEnvironment(scripts['test:geo']).NO_STRICT, "' '");
    assert.equal(prefixEnvironment(scripts['test:nogeo']).NO_STRICT, "' '");
  });

  it('every declared tier script is reachable, or deliberately excepted', () => {
    // The DERIVED property, not an enumeration. P094's root cause was a script
    // that existed, was correctly named and complete, and was reachable from no
    // chain — so a reader scanning package.json concluded the pair was tested.
    // This is the `reachable ⊆ declared` shape, and it would have caught P094
    // before it was filed.
    const reached = reachableFromNpmTest();
    const orphans = Object.keys(scripts)
      .filter((k) => TIER_SCRIPT.test(k))
      .filter((k) => !reached.has(k) && !EXCEPTED.has(k))
      .sort();
    assert.deepStrictEqual(
      orphans,
      [],
      `declared but reachable from no chain, so they look like coverage and are not: ${orphans.join(', ')}. Wire them, or add to EXCEPTED with the reason recorded in ADR-009.`,
    );
  });

  it('every exception is justified in ADR-009, so the two cannot rot apart', () => {
    // Without this, someone can rewrite the amendment out and the test stays
    // green — leaving an exception with no record, which is the state this file
    // exists to fix. See limit 3 in the header: presence of the name, not
    // quality of the reason.
    const adr = read(ADR_009);
    const undocumented = [...EXCEPTED].filter((k) => !adr.includes(k)).sort();
    assert.deepStrictEqual(
      undocumented,
      [],
      `excepted from the reachability guard but not explained in ADR-009: ${undocumented.join(', ')}`,
    );
  });

  it('does not except a script that is actually wired', () => {
    // The inverse rot, and the half that truly binds: a script gets wired, the
    // exception is forgotten, and the guard silently stops covering it.
    const reached = reachableFromNpmTest();
    const stale = [...EXCEPTED].filter((k) => reached.has(k)).sort();
    assert.deepStrictEqual(
      stale,
      [],
      `listed as deliberately unwired but reachable from \`npm test\`: ${stale.join(', ')}`,
    );
  });
});

describe('turbo root tasks — the release path must actually execute (workspace split)', () => {
  // MEASURED SILENT-GREEN TRAP, 2026-08-10. When the repo became a two-package
  // workspace, `turbo run ci:version` stopped finding anything: turbo runs tasks
  // in WORKSPACE PACKAGES, and `ci:version` / `ci:publish` live in the root
  // manifest, which turbo excludes from its package graph. The observed output
  // was:
  //
  //     WARNING  No tasks were executed as part of this run.
  //     Tasks:    0 successful, 0 total          exit 0
  //
  // That is the release path. `changeset version` would never run, no release PR
  // would ever be created, no publish would ever happen — on a GREEN run. Same
  // family as the unit-tier glob trap guarded by scripts/assert-test-files.mjs,
  // and as ADR-044's zero-match cucumber profile: a runner that finds nothing to
  // do and calls that success.
  //
  // The fix is turbo's root-task syntax (`//#<task>`), which addresses the
  // workspace root explicitly. Both halves are pinned because either alone is
  // insufficient: the script could invoke `//#ci:version` with no matching
  // turbo.json entry, or turbo.json could declare it while the script still
  // calls the bare name.
  const turbo = JSON.parse(read('../../../turbo.json'));

  it('runs Changesets version as an explicit root task', () => {
    assert.equal(scripts['turbo:ci:version'], 'turbo run //#ci:version');
    assert.ok(Object.hasOwn(turbo.tasks ?? {}, '//#ci:version'));
    assert.ok(scripts['ci:version']);
  });

  it('builds publishable packages before Changesets publish', () => {
    assert.equal(
      scripts['build:packages'],
      "turbo run build --filter='./packages/*'",
    );
    assert.ok(Object.hasOwn(turbo.tasks ?? {}, 'build'));
    assert.match(
      scripts['turbo:ci:publish'],
      /npm run build:packages && changeset publish/,
    );
    assert.doesNotMatch(
      scripts['turbo:ci:publish'],
      /changeset publish\s*\|\|/,
      'a publish failure must not fall through to a dry-run echo',
    );
  });
});
