// The 404 page's title, which is the one page where the missing title did the
// most damage.
//
// WHY THIS PAGE SPECIFICALLY. Every other page is usually reached on purpose. The
// 404 is reached by accident — from a stale bookmark, an old link, a search
// result — and ADR-053 deliberately routes traffic here: `/enterprise-price-request/`
// served a real form from 2019 until that import deleted it, and it was the
// target of the pricing page's Enterprise call-to-action. So a buyer following
// an old link lands on this page, and until now the tab, the history entry and
// the screen reader's first announcement all said nothing at all.
//
// THE TITLE ANNOUNCES THE ERROR, deliberately. A title reading just "Addressr"
// would satisfy a presence check and fail the descriptiveness half of WCAG 2.4.2
// — the visitor needs to learn from the tab that they did not arrive where they
// meant to.
//
// REGISTER: terse, not jokey, and this is a deliberate mismatch with the body
// copy. The body currently reads "You just hit a route that doesn't exist... the
// sadness." — which is the verbatim Gatsby starter default, not authored voice.
// A title is consumed with no context: in a tab, a bookmark, a history entry.
// Humour landing where nothing sets it up is not humour. "Page not found" is
// also the term the project's own voice guide names as preferred over "does not
// exist", which the body copy uses.
//
// The body copy is NOT changed here. It is a voice finding, it fails no success
// criterion, and it is recorded against the voice-guide gap rather than fixed
// under an accessibility ticket.
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
// Gatsby emits the 404 twice — `404.html` for the host's error handler and
// `404/index.html` for the route. Both are served to real visitors, so both are
// asserted; a fix that reached only one would leave the other silent.
const EMITTED = ['404.html', path.join('404', 'index.html')];
const titleOf = (html) =>
  (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim();

const EXPECTED = 'Page not found - Addressr by Mountain Pass';

describe('404 page title (P125)', () => {
  before(() => {
    for (const rel of EMITTED) {
      assert.ok(
        existsSync(path.join(PUBLIC, rel)),
        `apps/website/public/${rel} does not exist. This tier asserts on BUILT ` +
          'output; run `npm run build -w @mountainpass/website` first.',
      );
    }
  });

  for (const rel of EMITTED) {
    it(`${rel} carries the reviewed title`, () => {
      assert.equal(
        titleOf(readFileSync(path.join(PUBLIC, rel), 'utf8')),
        EXPECTED,
      );
    });
  }

  it('announces the error rather than just naming the site', () => {
    // The property the exact string protects. A title of "Addressr by Mountain
    // Pass" would pass every generic check in the sibling tier and tell a
    // visitor on a dead link nothing.
    const title = titleOf(readFileSync(path.join(PUBLIC, '404.html'), 'utf8'));
    assert.match(
      title.toLowerCase(),
      /not found/,
      `the 404 title is ${JSON.stringify(title)}, which does not tell a ` +
        'visitor arriving from a stale link that they did not reach the page ' +
        'they wanted. WCAG 2.4.2 asks the title to describe topic or purpose.',
    );
  });
});
