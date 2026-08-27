// The home page's buyer-led title, pinned as an editorial decision rather than
// a shape.
//
// WHY THIS IS SEPARATE from `../rendered-output.test.mjs`. That file asserts the
// PROPERTIES every page must have — a non-empty title, a distinct one, a lang.
// Those are conformance. This file pins ONE PAGE'S EXACT WORDING, and the
// wording is a decision someone made for reasons that are not visible in the
// string itself. A generic "has a title" assertion would stay green through a
// silent revert of that decision.
//
// THE DECISION, so a future reader can overturn it deliberately instead of by
// accident. The title used to read:
//
//     Addressr by Mountain Pass - Free Australian Address Validation, ...
//
// 87 characters, brand first. A browser tab shows roughly the first 25, so every
// tab of this site read "Addressr by Mountain Pas" and none was distinguishable
// from the others. The unique part now leads. The 2026-08-28 marketing review
// then replaced the feature list with the buyer outcome: Australian address
// quality through a hosted API.
//
// Two things were deliberately NOT done, and both were closer calls than the
// reorder:
//
//   - "by Mountain Pass" was NOT dropped, though dropping it would save 17
//     characters. Those characters sit past the tab truncation point, so they
//     buy nothing, and the other four pages carry the suffix — removing it here
//     would trade a real consistency gain for no visible benefit. The suffix is
//     an established compound: it is the API title in three swagger documents
//     and the manifest name in gatsby-config.ts.
//   - The shorter form was NOT justified by search-result width. P125 explicitly
//     declines to claim search discovery as a reason for any of this work, so
//     banking an SEO benefit here would contradict the ticket it belongs to.
//
// WCAG asks only that a title describe topic or purpose — technique G88 shows
// both word orders as acceptable — so none of the above is a conformance
// requirement, and this test should not be read as enforcing one.
//
// @jtbd JTBD-004
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../public',
);
const page = () => readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
const titleOf = (html) =>
  (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim();

const EXPECTED = 'Australian address quality API - Addressr by Mountain Pass';

describe('home page title (P125)', () => {
  before(() => {
    // Load-bearing: without it every assertion here passes vacuously when the
    // build has not run, reporting green having read nothing.
    assert.ok(
      existsSync(path.join(PUBLIC, 'index.html')),
      'apps/website/public/index.html does not exist. This tier asserts on ' +
        'BUILT output; run `npm run build -w @mountainpass/website` first.',
    );
  });

  it('is the exact reviewed string', () => {
    assert.equal(titleOf(page()), EXPECTED);
  });

  it('leads with the unique part, not the brand', () => {
    // The property the exact-string assertion above is protecting. Stated
    // separately so that if someone changes the descriptive clause — which is
    // marketing copy and legitimately theirs to change — the failure names the
    // rule that survives rather than just showing a diff of two long strings.
    assert.ok(
      !titleOf(page()).startsWith('Addressr'),
      'the home title leads with the brand again. Every tab of this site then ' +
        'reads "Addressr by Mountain Pas" and none is distinguishable from the ' +
        'others. The other four pages lead with their unique part; this one is ' +
        'the only page that has ever been the outlier.',
    );
  });
});
