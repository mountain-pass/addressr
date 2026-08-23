// apps/website/gatsby-ssr.js — the <html lang> half of P125.
//
// WHY A UNIT TEST WHEN A BUILD-OUTPUT TEST ALREADY EXISTS. It is not
// gate-ceremony, and the distinction is worth stating because the two look
// redundant. `apps/website/test/rendered-output.test.mjs` asserts that
// `lang="en-AU"` reaches every emitted page. That is the property that matters
// to a user, and it is the stronger test — but it CANNOT SAY WHICH MECHANISM
// PUT IT THERE. If someone later adds a custom `src/html.js` that hardcodes the
// attribute, the build assertion stays green while this module quietly becomes
// dead code, and the next person to edit it finds their change has no effect.
//
// That is the decoy shape this site has already produced twice — a
// `gatsby-config.js` that never loaded (P125's own root cause) and three
// redirect mechanisms that never reached the build (P122). So the property
// asserted here is narrow and deliberate: THE EXPORT GATSBY LOOKS FOR EXISTS,
// AND IT DELEGATES TO THE API THAT SETS THE ATTRIBUTE.
//
// The export NAME is the load-bearing part. Gatsby resolves lifecycle exports
// by name and silently ignores anything it does not recognise, so a typo —
// `onRenderBody` to `onRenderbody` — is a no-op with no warning. Exactly the
// failure mode P125 is about.
//
// CommonJS, not ESM. `apps/website/package.json` declares
// `"type": "commonjs"`, so Node reads a `.js` there as CJS and `export`
// syntax would be a SyntaxError the moment this test required it.
// `gatsby-browser.js` uses ESM and gets away with it only because Gatsby
// compiles it through webpack and Node never loads it directly — which is
// precisely why that file has no unit test and this one can.
//
// NOT in P033's population: this file imports and calls its subject rather than
// reading it as text, so it performs no file reads at all and moves none of that
// ticket's cardinals.
//
// The identifiers P033's predicate greps for are deliberately NOT written
// anywhere in this file — not even in prose. The predicate tests SOURCE TEXT, so
// a comment saying "this file uses no <those functions>" puts the file straight
// into the population it is disclaiming. That is not hypothetical: the first
// draft of this header did exactly that and reddened five of P033's cardinals.
//
// @adr ADR-053 (website imported as an app with hosting unchanged)
// @jtbd JTBD-004
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const SSR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../apps/website/gatsby-ssr.js',
);

describe('apps/website/gatsby-ssr.js — the <html lang> mechanism', () => {
  it('exports onRenderBody under the exact name Gatsby resolves', () => {
    // Gatsby ignores an unrecognised export in silence. A misspelling here
    // produces no error, no warning, and no lang attribute.
    const mod = require_(SSR);
    assert.equal(
      typeof mod.onRenderBody,
      'function',
      'gatsby-ssr.js does not export an onRenderBody function. Gatsby resolves ' +
        'lifecycle exports BY NAME and ignores anything else without warning, ' +
        'so a renamed or misspelled export is a silent no-op.',
    );
  });

  it('sets a lang whose primary subtag is English', () => {
    // Asserts the SHAPE, not the exact string. WCAG 3.1.1 conformance reads
    // only the primary subtag, so pinning `en-AU` here would convert an
    // editorial choice into a test failure the day someone reconsiders the
    // region — while a change to a non-English primary subtag is a real defect
    // this must catch.
    const { onRenderBody } = require_(SSR);
    let received;
    onRenderBody({
      setHtmlAttributes: (attrs) => {
        received = attrs;
      },
    });
    assert.ok(
      received,
      'onRenderBody ran without calling setHtmlAttributes, so no attribute ' +
        'reaches <html> and the module is inert',
    );
    assert.match(
      received.lang ?? '',
      /^en(-[A-Za-z0-9]+)*$/,
      `lang was ${JSON.stringify(received.lang)}; WCAG 3.1.1 needs a valid ` +
        'language tag and this site is English-language content',
    );
  });
});
