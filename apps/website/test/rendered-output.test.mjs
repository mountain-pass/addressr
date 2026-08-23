// Behavioural assertions over the website's BUILT OUTPUT.
//
// WHY THIS TIER EXISTS, and why it is not in test/js/__tests__/.
//
// The first version of these checks read JSX source and grepped it. That works,
// and it is the wrong shape twice over. P033 spent real effort converting
// source-inspection pins in this repo to behavioural ones, and its published
// population guard caught the regression the moment those files landed — 30 to
// 32 — which is exactly what that guard is for. Source greps also cannot see the
// things that actually break a page: a CSS rule hiding an element, a theme
// script intercepting a click, a plugin that is imported but never wired.
//
// So these assert on what Gatsby actually emits. That requires a build, which
// costs ~23s and produces `apps/website/public` — gitignored, and therefore
// absent in CI unless a job builds first. A test in the main `test:js` tier
// asserting on build output would fail in every job that does not build, or
// worse, be written to skip when the directory is missing and pass having
// examined nothing. Hence a separate tier with its own runner and its own CI
// job, in the pattern this repo already uses for `test:precommit`,
// `test:integration:search` and `test:mcp:smoke`.
//
// Being in apps/website/test/ also keeps these out of P033's predicate, which
// scans test/js/__tests__ — not as a dodge, but because they genuinely are not
// the class P033 measures. They exercise their subject.
//
// HONEST LIMIT, learned the hard way on the first production deploy. This tier
// asserts on what Gatsby EMITS — the origin. It cannot see what the CDN
// DELIVERS. Cloudflare's Email Obfuscation rewrites the Enterprise mailto and
// the visible address at the edge, so criterion 8's assertion below passes here
// and is partially defeated in production for no-JS visitors (P128). Nothing in
// this file is wrong; its scope is just narrower than "what a user sees", and
// the criterion was signed off as though the two were the same thing.
//
// @adr ADR-053 (website imported as an app with hosting unchanged)
// @jtbd JTBD-004
// @jtbd JTBD-401
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const websiteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(websiteRoot, 'public');
const ADDRESS = 'addressr@mountain-pass.com.au';

const read = (rel) => readFileSync(path.join(PUBLIC, rel), 'utf8');

/** Every file Gatsby emitted, recursively. */
const emitted = (dir = PUBLIC) => {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...emitted(full));
    else out.push(full);
  }
  return out;
};

describe('apps/website rendered output', () => {
  before(() => {
    // THE LOAD-BEARING PRECONDITION. Without it every assertion below passes
    // vacuously when the build has not run, and reports green having read
    // nothing — the failure this repo has been bitten by and the reason this
    // tier is separate rather than conditional.
    assert.ok(
      existsSync(PUBLIC),
      'apps/website/public does not exist. This tier asserts on BUILT output; ' +
        'run `npm run build -w @mountainpass/website` first. It must never be ' +
        'made to skip — a green here with no build is a lie about coverage.',
    );
    assert.ok(
      emitted().length > 50,
      `only ${emitted().length} files emitted; the build is incomplete`,
    );
  });

  describe('every page has a title and a language (P125)', () => {
    // WRITTEN TO FAIL, 2026-08-24. Both are Level A and both are broken on
    // every page of the live site.
    //
    // 2.4.2 Page Titled fails in a way source inspection CANNOT see, which is
    // exactly why these belong in the built-output tier. Five of the six pages
    // DO declare `<Helmet><title>…</title></Helmet>` and `react-helmet`
    // resolves fine — so a source grep for `<title` finds them and reports
    // health. What is missing is `gatsby-plugin-react-helmet`, the SSR bridge,
    // absent from both the manifest and the config Gatsby actually loads.
    // Helmet therefore mutates the DOM after hydration and puts nothing into
    // the static document that a screen reader on first paint, a browser tab,
    // a bookmark and a crawler all read.
    //
    // 3.1.1 Language of Page has the same invisibility and a different cause:
    // no page ever set it, through Helmet or otherwise.
    //
    // @jtbd JTBD-004 — its Confirmation section names this defect by name and
    // records it NOT MET. These assertions are that criterion, executable.

    /**
     * Every emitted page as [file, route, html] — derived, so a new page is
     * covered without editing this list.
     *
     * TWO EXCLUSIONS, both discovered by these assertions failing on things
     * that are not pages, and both narrow on purpose:
     *
     *   - `_gatsby/**` holds Gatsby's own slice fragments. They are HTML by
     *     extension and not documents by nature — `_gatsby-scripts-1.html` is a
     *     bare `<script>` block with no <html> element — so no title or lang
     *     could apply. Excluded by directory rather than by name, because
     *     Gatsby adds more of them.
     *   - Nothing else. In particular `page-data/404.html` is a DIRECTORY, not
     *     a file, so it never enters this set; noted because a `find -name
     *     "*.html"` does match it and would suggest a hole that is not there.
     *
     * ROUTE, not filename, is the identity. Gatsby emits the 404 twice —
     * `404.html` for the host's error handler and `404/index.html` for the
     * route — and they are ONE page. Distinctness has to know that, or a
     * correct site fails the check.
     */
    const pages = () =>
      emitted()
        .filter((f) => f.endsWith('.html'))
        .map((f) => path.relative(PUBLIC, f))
        .filter((rel) => !rel.split(path.sep).includes('_gatsby'))
        .map((rel) => [
          rel,
          rel.replace(/[/\\]index\.html$/, '').replace(/\.html$/, '') || '/',
          readFileSync(path.join(PUBLIC, rel), 'utf8'),
        ]);

    const titleOf = (html) =>
      (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim();

    it('emits at least the six known pages, so nothing below can pass on an empty set', () => {
      // The floor. Without it every assertion here is vacuous the day the page
      // set fails to build, and reports green having examined nothing.
      const routes = [...new Set(pages().map(([, route]) => route))];
      assert.ok(
        routes.length >= 6,
        `only ${routes.length} HTML pages emitted (${routes.join(', ')}); the ` +
          'site has six, so a set this small means the build is incomplete ' +
          'rather than the pages clean',
      );
    });

    it('gives every page a non-empty <title>', () => {
      const untitled = pages()
        .filter(([, , html]) => titleOf(html) === '')
        .map(([file]) => file);
      assert.deepEqual(
        untitled,
        [],
        'pages emitted with no usable <title>. WCAG 2.4.2 is Level A: a screen ' +
          'reader announces the URL or nothing when the tab opens, and every ' +
          'tab and bookmark is unlabelled.',
      );
    });

    it('gives every page a DISTINCT title, not one repeated site-wide', () => {
      // 2.4.2 asks the title to describe TOPIC OR PURPOSE. Six identical
      // titles would satisfy the presence check above and fail the criterion,
      // so distinctness is the assertion that carries it.
      const seen = new Map();
      for (const [, route, html] of pages()) {
        const title = titleOf(html);
        if (!title) continue;
        // Keyed by ROUTE, so the 404's two emissions count once.
        seen.set(title, new Set([...(seen.get(title) ?? []), route]));
      }
      const shared = [...seen.entries()]
        .map(([title, routes]) => [title, [...routes]])
        .filter(([, routes]) => routes.length > 1)
        .map(([title, routes]) => `"${title}" on ${routes.join(' + ')}`);
      assert.deepEqual(
        shared,
        [],
        'the same title appears on more than one page, so it cannot be ' +
          "describing either page's topic or purpose",
      );
    });

    it('has exactly one of each Gatsby lifecycle file, so no decoy can sit beside a live one', () => {
      // NOT a source-content grep, and the distinction matters for P033: this
      // asks the filesystem how many files share a basename, not what any of
      // them says. It exists because this tree has produced TWO instances of
      // the decoy class in a week. `gatsby-config.js` and `gatsby-config.ts`
      // both shipped; only the `.ts` ever loaded, and the `.js` — the one with
      // the obvious filename, naming the Helmet plugin and the analytics IDs —
      // had never executed. That is P125's root cause and P122's both.
      //
      // The <title> assertions above prove the LOADED config is right. They
      // cannot see a second file that looks authoritative and runs never.
      const roots = ['gatsby-config', 'gatsby-ssr', 'gatsby-browser', 'gatsby-node'];
      const duplicated = roots
        .map((base) => [
          base,
          readdirSync(websiteRoot).filter((f) => f.replace(/\.[^.]+$/, '') === base),
        ])
        .filter(([, matches]) => matches.length > 1)
        .map(([base, matches]) => `${base}: ${matches.join(' + ')}`);
      assert.deepEqual(
        duplicated,
        [],
        'more than one file shares a Gatsby lifecycle basename. Gatsby loads ' +
          'exactly one and ignores the rest silently, so the other is a decoy ' +
          'that a maintainer will read and believe.',
      );
    });

    it('declares a language on <html> for every page', () => {
      const unlabelled = pages()
        .filter(([, , html]) => !/<html[^>]*\slang=["'][^"']+["']/i.test(html))
        .map(([file]) => file);
      assert.deepEqual(
        unlabelled,
        [],
        'pages emitted with no lang on <html>. WCAG 3.1.1 is Level A: without ' +
          'it a screen reader reads the page in whatever voice it defaults to, ' +
          'mispronouncing the content for anyone whose default is not English.',
      );
    });
  });

  describe('Enterprise call-to-action (ADR-053 criterion 8)', () => {
    it('resolves to the address by mailto', () => {
      assert.match(
        read('pricing/index.html'),
        new RegExp(`href="mailto:${ADDRESS.replace(/\./g, '\\.')}`),
        'the Enterprise CTA does not reach a mailto: for the enterprise address',
      );
    });

    it('renders the address as VISIBLE TEXT, not only as an href', () => {
      // The whole point of the criterion. A mailto: is inert for webmail users
      // and anyone with no mail client configured, so the address has to be
      // readable on the page. `>address<` matches element text specifically,
      // which an href-only implementation would not produce.
      assert.match(
        read('pricing/index.html'),
        new RegExp(`>\\s*${ADDRESS.replace(/\./g, '\\.')}\\s*<`),
        'the address appears only inside an href. A reader with no mail client ' +
          'has nothing to copy, which is what criterion 8 exists to prevent.',
      );
    });

    it('does not ship a Gatsby-resolved path in place of the mailto', () => {
      // Gatsby's <Link> runs `to` through reach-router path resolution, which
      // does not recognise mailto: and yields a site-relative path. This is the
      // exact artefact that mistake produces, and only rendered output shows it.
      assert.doesNotMatch(
        read('pricing/index.html'),
        /href="\/[^"]*mailto:/,
        'a mailto was resolved as a site-relative path — the CTA went through ' +
          'Gatsby <Link> instead of a plain anchor',
      );
    });
  });

  describe('deleted routes leave no live links', () => {
    for (const route of ['/enterprise-price-request/', '/r/account/', '/callback/']) {
      it(`no emitted page links to ${route}`, () => {
        const offenders = emitted()
          .filter((f) => f.endsWith('.html'))
          .filter((f) => readFileSync(f, 'utf8').includes(`href="${route}"`))
          .map((f) => path.relative(PUBLIC, f));
        assert.deepEqual(
          offenders,
          [],
          `${route} is deleted by ADR-053; a surviving link is a 404 on a ` +
            'documented journey',
        );
      });
    }
  });

  describe('no credential reaches the browser (JTBD-401)', () => {
    it('emits no Slack webhook URL in any built asset', () => {
      // THE HALF THAT ACTUALLY MATTERED in 2019. The exposed webhook was a
      // browser `fetch` whose URL was inlined into a client bundle — invisible
      // to a source grep of the pages, visible here. JTBD-401 records this
      // criterion as NOT MET precisely because no such scan existed.
      const host = 'hooks.slack' + '.com';
      const offenders = emitted()
        .filter((f) => readFileSync(f, 'utf8').includes(host))
        .map((f) => path.relative(PUBLIC, f));
      assert.deepEqual(offenders, [], 'a Slack webhook URL reaches the browser bundle');
    });

    it('emits no NEW Google API key beyond the one already known', () => {
      // R2 from the pre-commit risk review, and it is a correction rather than an
      // addition. The check above was scoped to the single credential ADR-053
      // already deletes, so a tier advertised as closing the 2019 build-output gap
      // could not see the one live credential still in the tree: the Google Maps
      // browser key in Search.js, whose referrer restriction is UNVERIFIED
      // (JTBD-401 records two probes that failed to discriminate).
      //
      // The known key is allowlisted rather than asserted absent, because a Maps
      // BROWSER key legitimately has to reach the browser — removing it breaks the
      // demo. What this catches is a SECOND one arriving, which is the class the
      // job actually guards. When the restriction is confirmed in the Cloud
      // console, record it in JTBD-401 and this allowlist stops being provisional.
      const KNOWN = 'AIzaSyBJ9PUm';
      const keyShape = /AIza[0-9A-Za-z_-]{35}/g;
      const found = new Set();
      for (const f of emitted()) {
        for (const m of readFileSync(f, 'utf8').matchAll(keyShape)) found.add(m[0]);
      }
      // Encode the floor rather than relying on a point-in-time mutation proof.
      // Without it `unknown` is empty when no key is present AT ALL, and this
      // file's own header calls that green a lie about coverage.
      assert.ok(
        found.size >= 1,
        'no Google API key found in build output at all — the known key should ' +
          'be there, so an empty match set means the scan is broken, not the ' +
          'bundle clean',
      );
      const unknown = [...found].filter((k) => !k.startsWith(KNOWN));
      assert.deepEqual(
        unknown.map((k) => `${k.slice(0, 12)}…`),
        [],
        'an unrecognised Google API key reaches the browser bundle',
      );
    });
  });
});
