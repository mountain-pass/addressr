/**
 * WHY THIS FILE EXISTS: `<html lang>`, and nothing else.
 *
 * P125 — every page of this site shipped with no language declared on <html>.
 * WCAG 3.1.1 Language of Page, Level A. Without it a screen reader reads the
 * page in whatever voice it defaults to, mispronouncing the content for anyone
 * whose default is not English.
 *
 * IT CANNOT GO IN THE `Head` EXPORT, which is where the <title> half of P125
 * lives. Gatsby's Head API emits children of <head> and has no way to set
 * attributes on <html> or <body>. So P125 needs two mechanisms, and that is a
 * property of the framework rather than a choice worth revisiting.
 *
 * ONE PLACE, SIX PAGES. `onRenderBody` runs for every page Gatsby renders,
 * 404 included, so the alternative — repeating the attribute per page — would
 * be six chances to miss one. It runs through Gatsby's own SSR entries, so it
 * applies to `gatsby build` and `gatsby develop` alike.
 *
 * IT ONLY WORKS BECAUSE THERE IS NO CUSTOM `src/html.js`. Gatsby's default HTML
 * component spreads `htmlAttributes` onto <html>; a custom one that forgot to
 * would make this a silent no-op — P125's own failure mode exactly, a mechanism
 * that looks configured and reaches nothing. Anyone adding `src/html.js` must
 * spread `htmlAttributes`. Two tests will catch them if they do not: the
 * built-output assertion that every emitted page carries `lang`, and
 * `test/js/__tests__/gatsby-ssr.test.mjs`, which exists to tell "this module is
 * working" apart from "something else set the attribute and this is dead code".
 *
 * CommonJS, and `.js` rather than `.ts`. The manifest declares
 * `"type": "commonjs"`, so Node reads this as CJS — which is what lets the unit
 * test require it. `gatsby-browser.js` uses ESM syntax and is fine because
 * Gatsby compiles it through webpack and Node never loads it directly; that is
 * also why it has no unit test. A `.ts` file here would fall outside
 * `tsconfig.json`'s `include` list and go untypechecked, which would be a third
 * instance of the "looks authoritative, is not wired" class this site already
 * has two of.
 *
 * en-AU RATHER THAN en, and the reason is narrower than it first looks. Both
 * satisfy 3.1.1 identically — conformance reads only the primary subtag, so
 * this is an editorial choice and is deliberately not asserted as a conformance
 * requirement. It is justified by the CONTENT, not by the audience or the
 * subject matter, neither of which is what BCP 47 encodes: the copy uses
 * Australian orthography, and the live demo reads G-NAF place names aloud.
 * Australian toponyms — Prahran, Launceston, Woolloomooloo — are mispronounced
 * by en-US and en-GB voices. It is also safe rather than a gamble: RFC 4647
 * lookup truncates from the right, so a reader with no en-AU voice falls back
 * to the same en voice that plain `en` would have selected. There is no case
 * where a valid en-AU is worse than en.
 *
 * @adr ADR-053 (website imported as an app with hosting unchanged)
 * @jtbd JTBD-004
 */
exports.onRenderBody = ({ setHtmlAttributes }) => {
  setHtmlAttributes({ lang: 'en-AU' });
};
