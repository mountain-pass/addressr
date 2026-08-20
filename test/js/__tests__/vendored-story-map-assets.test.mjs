// @jtbd JTBD-400
//
// WHY THIS EXISTS. `docs/story-maps/story-map.css` is 195 lines this repo did
// not write. It is committed because the maps are committed artefacts and render
// unstyled without it, and `docs/story-maps/README.md` claims it is "vendored
// verbatim from @windyroad/itil 1.1.1 and byte-identical to the upstream copy".
//
// Until this file existed that claim was PROSE WITH NOTHING RECOMPUTING IT.
// There was no mechanical path to check it, because the renderer reached the
// repo as a $PATH plugin shim rather than as a dependency — so CI had no
// upstream copy to compare against. Adding `@windyroad/itil` as an exact
// devDependency is what turns the claim into something checkable, and this is
// the check.
//
// WHY BYTE-IDENTITY IS THE PROPERTY, not "close enough": if the local copy
// drifts, every re-render after an upstream upgrade emits a whole-file diff, and
// a real change — a contrast fix, a focus-ring change — is invisible inside it.
// Identical means an unchanged upstream produces an EMPTY diff and a changed one
// produces a readable diff. `.prettierignore` protects it from lint-staged;
// this protects it from everything else.
//
// THE PIN MUST BE EXACT. A caret range would let `npm ci` fetch 1.1.2 while the
// committed CSS stayed at 1.1.1, and this test would then fail for a reason that
// reads like drift but is a version skew. Asserting the pin shape keeps the
// failure honest.
//
// NOT COVERED: whether the renderer's OUTPUT is correct — that is
// `story-tier-invariants` and `doc-links-resolve`. This covers only that the
// inputs the repo vendors are the inputs it says it vendors.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../');
const UPSTREAM = path.join(REPO, 'node_modules/@windyroad/itil');
const VENDORED_CSS = path.join(REPO, 'docs/story-maps/story-map.css');
const RENDERER = path.join(UPSTREAM, 'scripts/render-story-map.mjs');

const pkg = JSON.parse(readFileSync(path.join(REPO, 'package.json'), 'utf8'));

describe('vendored story-map assets match the dependency they claim', () => {
  it('finds both copies to compare, so a zero-match pass is impossible', () => {
    // A missing node_modules copy would make a naive comparison vacuously true.
    assert.ok(existsSync(VENDORED_CSS), 'docs/story-maps/story-map.css is absent');
    assert.ok(
      existsSync(path.join(UPSTREAM, 'templates/story-map.css')),
      '@windyroad/itil is not installed — the comparison would have nothing to compare against',
    );
    assert.ok(readFileSync(VENDORED_CSS).length > 1000, 'the vendored stylesheet is implausibly small');
  });

  it('pins @windyroad/itil to an exact version, not a range', () => {
    const spec = pkg.devDependencies?.['@windyroad/itil'];
    assert.ok(spec, '@windyroad/itil is not a devDependency');
    assert.match(spec, /^\d+\.\d+\.\d+$/, `@windyroad/itil must be pinned exactly; found "${spec}"`);
  });

  it('the committed stylesheet is byte-identical to the installed one', () => {
    const ours = readFileSync(VENDORED_CSS);
    const theirs = readFileSync(path.join(UPSTREAM, 'templates/story-map.css'));
    assert.ok(
      ours.equals(theirs),
      'docs/story-maps/story-map.css has drifted from @windyroad/itil. Restore it with:\n' +
        '  cp node_modules/@windyroad/itil/templates/story-map.css docs/story-maps/story-map.css\n' +
        'Do not hand-edit it — edit upstream and re-render.',
    );
  });

  it('the renderer is reachable without a plugin on $PATH', () => {
    // This is what lets CI REPAIR a stale map rather than only detect one.
    // `npm run render:story-maps` invokes exactly this path.
    assert.ok(existsSync(RENDERER), 'the story-map renderer is missing from the installed package');
    const script = pkg.scripts?.['render:story-maps'];
    assert.ok(script, 'no render:story-maps script');
    assert.match(script, /node_modules\/@windyroad\/itil/, 'the script must use the installed copy, not a $PATH shim');
    // The renderer takes ONE file — a bare glob would render the first map and
    // leave the rest stale, silently. The script must iterate.
    assert.match(script, /\bfor\b.*\bdo\b/, 'the script must loop per file; the renderer accepts one path');
  });
});
