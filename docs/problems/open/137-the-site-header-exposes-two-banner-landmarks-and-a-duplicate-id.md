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

**Neither was visible to any of the 25 built-output assertions**, which read emitted HTML and cannot see a CSS rule that stopped matching. An architecture review caught both. That is the evidence [P138](../open/138-nothing-decides-what-enforces-accessibility-conformance-on-apps-website.md) exists to act on.

## Investigation Tasks

- [x] Give the status strip its own `status-header` id and share only the frame, logo and `.alt` rules it genuinely needs with the main header.
- [x] Unwrap the disclosure button and move the base, breakpoint and forced-colors selectors together to `.nav`.
- [x] Keep `id="header"` on the sole real header as the existing stable styling hook; removing it would add churn without fixing another defect.
- [x] Verify the status-strip and menu-button geometry in Chromium at the base, xlarge, large, small and xsmall bands.

## Root Cause Analysis

The template reused document landmarks and the same id as layout hooks. Responsive menu styling was also coupled to the wrapper's `nav` element type, so the first semantic correction killed live breakpoint selectors. A separate duplicate `id="two"` on the Quick Start page showed that emitted id uniqueness was not checked generically.

## Fix Released

Implemented on 2026-08-26. The site keeps one `header#header`; the status strip is now `div#status-header`, and the disclosure button uses a non-landmark `.nav` wrapper. Shared SCSS is limited to the frame, logo and `.alt` behavior, while all menu rules — including forced-colors and four breakpoint blocks — use `.nav`. The two unused duplicate `id="two"` values were removed from Quick Start.

The seven-route Gatsby build passes 33 built-output assertions, including unique ids and exactly one banner and navigation landmark per page. ADR-055's two mutation regressions now exercise the new status and menu hooks. All 13 Chromium journeys pass, including status placement and menu geometry at all five affected viewport bands. Awaiting exact production verification before closure.

## Related

- [P131](../closed/131-the-site-menu-cannot-be-opened-or-closed-by-keyboard-on-any-page.md) — where this was attempted, reverted, and split out. Carries the full account.
- [P138](../open/138-nothing-decides-what-enforces-accessibility-conformance-on-apps-website.md) — what would have caught it.
