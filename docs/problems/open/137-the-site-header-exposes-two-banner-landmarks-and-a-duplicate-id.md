# Problem 137: The site header exposes two banner landmarks and a duplicate id

**Status**: Open
**Reported**: 2026-08-24
**Priority**: 6 (Medium) — Impact: Moderate (3) × Likelihood: Likely (2). Impact 3: a screen-reader user navigating by landmark meets two "banner" regions on every page and a navigation landmark that contains one button, so the landmark map — the primary non-visual way to skim a page — is misleading rather than absent. Not Level A on its own. Likelihood 2: it affects every landmark-navigating visitor on all six pages, but only that population.
**Origin**: internal
**Effort**: M — the markup change is three tokens. Making it safe is a stylesheet refactor, and the estimate exists because the naive version was already tried and reverted.
**WSJF**: 3.0 — (6 × 1.0) / 2
**JTBD**: JTBD-401
**Persona**: addressr-maintainer

## Description

`Header.js` renders three problems into every page:

1. **Two elements carry `id="header"`** — the main header and the uptime-badge strip below it. Ids are unique by definition; two elements sharing one is invalid, and `document.getElementById` can only ever reach the first.
2. **Both are `<header>` at document scope, so both expose `role="banner"`.** A page is supposed to have one. A user navigating by landmark hears "banner" twice and cannot tell which is the site header.
3. **A `<nav>` wraps a single disclosure button.** Since the keyboard fix, the header's flex wrapper contains exactly one control — a button that opens the menu. That is not navigation, and it competes in the landmark list with the real `<nav id="menu">`.

## Why this is its own ticket, and what it costs

All three were fixed inside [P131](../closed/131-the-site-menu-cannot-be-opened-or-closed-by-keyboard-on-any-page.md) and then **reverted**, because the fix as written was two live visual regressions on a production marketing site. That attempt is the most useful thing this ticket carries, so it is recorded rather than summarised:

- **`<header id="header" class="alt status-header">` → `<div class="alt status-header">`.** The justification written at the time was "`.status-header` is already the styling hook, so nothing visual depends on the tag or the id". One grep falsifies it: `_header.scss:20` reads `#header.status-header`, **id-qualified**. The id was the element's only stylesheet reachability. Dropping it loses the entire `#header` block (`position: fixed`, `height: 3.25em`, background, shadow, `text-transform`), the four breakpoint `top` offsets that place this strip _below_ the main header, `#header.alt` (which makes it absolute and transparent), `#header .logo` for the badge anchor, and the `body.is-loading` fade. An out-of-flow element becomes in-flow at the top of a wrapper whose `padding-top` is sized for exactly one fixed header — a layout shift on all six pages.
- **`<nav>` → `<div className="nav">`, with only the base selector widened.** `_header.scss` nests four breakpoint blocks under a bare `nav`. All four went dead. The worst is xsmall, where `overflow: hidden; text-indent: 5em; width: 5em` is what hides the label behind the hamburger glyph: on mobile the button renders the literal word "Menu" at the wrong width.

**Neither was visible to any of the 25 built-output assertions**, which read emitted HTML and cannot see a CSS rule that stopped matching. An architecture review caught both. That is the evidence [P138](138-nothing-decides-what-enforces-accessibility-conformance-on-apps-website.md) exists to act on.

## Investigation Tasks

- [ ] Give the status strip a distinct id and repoint `_header.scss:20`, **or** de-qualify that rule into a standalone `.status-header` block carrying every property it currently inherits from `#header`. The second is the honest option — the element is not a header — but it means transcribing the `#header` block, its `.alt` variant, its `.logo` descendant rule and its load-fade participation, which is the whole of the M estimate.
- [ ] Unwrap the disclosure button. The four breakpoint `nav { a, button { &.menu-link } }` blocks and the base flex wrapper must move to whatever selector replaces it, **in the same change** — the partial version is what was reverted.
- [ ] Decide whether the main header should keep `id="header"` at all once the duplicate is gone, or whether both should become classes. Leaving one id in place is fine and cheaper; say which and why.
- [ ] Verify in a browser at every breakpoint, not by assertion. Both regressions above passed a green suite. At minimum: the status strip's computed `position` / `top` / logo `display`, and the button's computed `text-indent` and `width` at xsmall.

## Related

- [P131](../closed/131-the-site-menu-cannot-be-opened-or-closed-by-keyboard-on-any-page.md) — where this was attempted, reverted, and split out. Carries the full account.
- [P138](138-nothing-decides-what-enforces-accessibility-conformance-on-apps-website.md) — what would have caught it.
