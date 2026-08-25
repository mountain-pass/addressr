# Problem 131: The site menu cannot be opened or closed by keyboard, on any page

**Status**: Closed — 2026-08-24, fixed and verified by keyboard in a browser
**Reported**: 2026-08-24
**Priority**: 16 (High) — Impact: Major (4) × Likelihood: Certain (4). Impact 4: the primary navigation of a public commercial site is **entirely unavailable** to anyone who cannot use a pointer. Not degraded — absent. A keyboard or switch user, or anyone driving the site by screen reader, cannot reach the menu at all, which removes every route between pages except the footer. WCAG 2.1.1 Keyboard is **Level A**, the floor. This is higher-impact than [P125](../closed/125-every-page-of-the-website-ships-without-a-title-element.md), which was WSJF 12: an untitled page is still usable, an unreachable navigation is not. Likelihood 4: not a probability. Realised and live on all six pages, verified in source and reproduced on the built output 2026-08-24.
**Origin**: internal
**Effort**: S — two elements change from `<a>` to `<button type="button">`, plus whatever CSS follows. The skip link is a few more lines.
**WSJF**: 16.0 — (16 × 1.0) / 1
**JTBD**: JTBD-004
**Persona**: web-app-developer

## Description

Found while fixing [P125](../closed/125-every-page-of-the-website-ships-without-a-title-element.md). Not caused by it, and deliberately not fixed there — it is a bigger defect than the one that ticket was about, and folding it in would have buried it.

Both controls that operate the site menu are anchors with no `href`:

```jsx
// apps/website/src/components/Header.js — opens the menu
<a className="menu-link" onClick={onToggleMenu}>Menu</a>

// apps/website/src/components/Menu.js — closes it
<a className="close" onClick={onToggleMenu}>Close</a>
```

An `<a>` without an `href` is not a link. It is not in the tab order, it exposes no role to assistive technology, and it does not respond to Enter or Space. The `onClick` fires on pointer events only. So the menu **opens and closes by mouse and by nothing else**, on every page of the site.

## What makes this worse than an ordinary markup slip

**Both files open with a lint suppression for the exact rule that catches it:**

```js
/* eslint-disable jsx-a11y/anchor-is-valid */
```

That comment is inert twice over — `eslint-plugin-jsx-a11y` is not installed, and `eslint.config.js` puts `apps/website/**` in `globalIgnores`. So it suppresses nothing. What it does record is that whoever wrote it saw the warning and turned it off rather than fixing it. The defect has been shipping since at least the 2019-era template it came from.

**Nothing is statically linting accessibility on this site at all.** That is the standing condition behind this and its siblings, and it was a deliberate phase-1 scoping call in [ADR-053](../../decisions/053-website-imported-as-an-app-with-hosting-unchanged.proposed.md), which named `jsx-a11y` as "the obvious later addition". This ticket is evidence for taking that up.

## A second Level A defect in the same class

**There is no skip link anywhere on the site.** Every page renders the same ribbon, header, logo and nav before its main content, and nothing lets a keyboard user jump past them to `<div id="main">`. WCAG 2.4.1 Bypass Blocks, Level A.

Filed here rather than separately because it is the same journey, the same users, and the same fix session: both are "a keyboard user cannot get around this site". They should be verified together — fixing the toggle without a skip link still leaves a keyboard user tabbing through the whole header on every page.

## Investigation Tasks

- [ ] Convert both controls to `<button type="button">`. Check the CSS: `.menu-link` and `.close` are styled as anchors, so a button will need `background: none; border: 0; font: inherit` or equivalent to look unchanged. The visual result must be identical — this is a semantics fix, not a redesign.
- [ ] Check the menu's own state semantics while there. A disclosure control should carry `aria-expanded`, and the toggle should move focus into the menu on open and back to the toggle on close. Neither exists today. Note that `aria-expanded` is 4.1.2 and the focus behaviour is 2.4.3 — related, but do not let them expand this ticket past the Level A blocker.
- [ ] Add a skip link targeting `#main`, visible on focus. Confirm `id="main"` is actually present on every page — it is on the ones checked, but the 404 and api-docs pages have different body structures.
- [ ] Delete both `eslint-disable jsx-a11y/anchor-is-valid` comments once the anchors are gone. Leaving them would preserve the signal that a suppression is doing work when it is not.
- [ ] Add a behavioural assertion to `apps/website/test/rendered-output.test.mjs`: no emitted page contains an `<a>` with an `onclick` and no `href`, and every page emits a skip link. Source inspection would not be enough here for the same reason it was not enough for P125 — the built output is what a user gets.
- [ ] **Verify with an actual keyboard, not only with a test.** Tab from page load and confirm the menu can be opened, navigated and closed, and that focus is not lost when it closes. The automated assertion checks the markup is capable; only driving it checks it works.

## Related

- [P125](../closed/125-every-page-of-the-website-ships-without-a-title-element.md) — found during that fix; its Fixed section records this and the other findings.
- [P126](126-two-footer-links-render-without-an-href-on-every-page.md) — the same "anchor that is not a link" class, in the footer. Different cause (`to` used where `href` belongs) and lower impact, since the footer has other working links, but a single fix session should probably take both.
- [ADR-053](../../decisions/053-website-imported-as-an-app-with-hosting-unchanged.proposed.md) — deferred `jsx-a11y` out of phase 1, and predicted the accessibility gate would begin firing permanently after the import. It did.

## Fixed 2026-08-24

Both controls are `<button type="button">`. A skip link is the first focusable element on every page, targeting a new `<main id="content">` landmark. Verified by driving a browser, not only by assertion — which is the only reason the most important defect here was found at all.

### The skip link did not work, and every assertion passed anyway

Seven built-output assertions were written first and all seven were green on a build where **activating the skip link left focus on the link**. It updated the URL to `#content` and scrolled the page; the next Tab landed on "Find us on GitHub" — the first thing a skip link exists to skip.

The link was present. Its fragment resolved to exactly one `id`. It was first in the focus order. All true, and none of them is the property that matters, which is that **focus moves**. `href="#content"` plus `tabIndex="-1"` on the target was not enough; there is now an explicit `onClick` handler in `layout.js` that focuses the target. No `preventDefault`, so the hash and the scroll still work and a no-JS visitor keeps the native behaviour.

This is the clearest instance yet of a green test proving a thing is _capable_ rather than _functional_, and it would have shipped.

### The skip-link target was nearly wrong in a way that mattered

The ticket proposed `#main`. An accessibility review rejected it: `#main` is a **styling hook** — `_main.scss` gives it a background and pads its direct children — and on five of six pages the `<h1>` sits **outside** it, inside `<Banner>`. A skip link to `#main` would have skipped the page heading and, on the home page, the live address search. The real fix was a `<main>` landmark that actually wraps the content. `/api-docs/` having no `#main` at all was the symptom that prompted the check, not the whole problem.

### What went in beyond the bare 2.1.1 fix, and why

The review drew the scope line and the argument for each is that **this fix creates the exposure**:

- **`aria-expanded`** — a pre-existing 4.1.2 gap, but the affected population goes from nobody to everybody the moment the control works.
- **Focus into the menu on open, and back to the opener on dismiss.** `#menu` is a sibling _after_ `#wrapper`, so without it a working button leads into the page, not the menu.
- **Escape closes.** The close control is the last child after eight links, and the overlay eats pointer events.
- **`inert` on `#wrapper` while open.** The open state was `filter: blur(0.5em)` and nothing else, so Tab walked the entire blurred page — every link, the footer — before reaching a menu item, each stop invisible under a 90%-opaque overlay. Measured after the fix: 9 focusable elements with the menu open, against roughly 20 before.
- **OUT on the merits, not deferred:** focus trap (replaced by `inert`), and `role="dialog"`/`aria-modal` (a declaration where `inert` is the enforcement, and `role="dialog"` on the `<nav>` would destroy the navigation landmark).

`handleToggleMenu` had to be split into three. It served open, close-by-dismiss and close-by-navigate — the menu's own links call it so the overlay does not survive a route change. Focus-return must fire for the second and not the third, or it fights a Gatsby route transition.

### Two of my own defects, caught by review rather than by me

- **`text-transform: none` was a live visual regression.** `#header` sets `uppercase` and it inherits; `_button.scss` sets the _same_ value, so that property never leaked anything and needed no neutralising. `none` was the change, not the fix — the label rendered sentence-case on four of five breakpoints.
- **The opener's focus ring was clipped on two edges.** `#header` is `position: fixed; top: 0` and the button sits flush right, so `outline-offset: 2px` painted outside the viewport. The identical geometry on `.close` I had diagnosed correctly and then missed here. Both rings are inset now.

### Verified by keyboard, 2026-08-24

Tab reaches the opener; `:focus-visible` matches and shows a 2px `#9bf1ff` ring on all four sides (11.15:1 on `bg`, ~6.8:1 worst case over the banner composite); the label renders MENU with the hamburger intact. Activation opens the menu, sets `aria-expanded="true"`, moves focus to `nav#menu` and applies `inert`. Escape closes it, restores focus to the opener and removes `inert`. The close button does the same. Skip-link activation lands focus on `<main id="content">`, and the next focusable element is inside it.

### Also fixed here: [P126](126-two-footer-links-render-without-an-href-on-every-page.md)

The built-output assertion is deliberately broader than this ticket — _no anchor without an `href`, anywhere_ — which the review pointed out also catches the two footer `<a to="…">` links. One assertion, two tickets; leaving P126 open would have redded the suite.

### Tasks

- [x] Convert both controls to `<button type="button">`, with the CSS that follows.
- [x] `aria-expanded`, focus on open, focus return, Escape. Plus `inert`, which was not on the original list and is what stops the fix stranding people behind the overlay.
- [x] Skip link — target corrected from `#main` to a real `<main>` landmark.
- [x] Delete both `eslint-disable jsx-a11y/anchor-is-valid` comments.
- [x] Behavioural assertions in the built-output tier. **With the caveat above**: they did not catch the one defect that mattered, and the test file now records that.
- [x] Verify with an actual keyboard. This found the skip-link defect. It should not be optional on a ticket of this shape.

### Two more of my own defects, caught by architecture review — and both were CSS

The section above says an accessibility review found two. An architecture review then found two more, and they are the more instructive pair, because **not one of the 25 built-output assertions could see either.** Both were live visual regressions on all six pages of a production marketing site, shipped inside a change whose own constraint reads "the visual result must be identical".

**The second `<header id="header">` became a `<div>`, and lost every style rule it had.** The comment justifying it read: "`.status-header` is already the styling hook, so nothing visual depends on the tag or the id." One grep falsifies that — `_header.scss:20` is `#header.status-header`, **id-qualified**. Dropping the id removed the element's only stylesheet reachability: the whole `#header` block (`position: fixed`, height, background, shadow), its four breakpoint `top` offsets, `#header.alt`, `#header .logo` for the uptime badge, and the load fade. An out-of-flow element becomes an in-flow one at the top of a wrapper whose `padding-top` is sized for exactly one fixed header.

**The `<nav>` became `<div className="nav">`, and I widened the base selector only.** Four breakpoint blocks nest under a bare `nav`, and all four went dead — including the xsmall block that hides the label behind `text-indent: 5em; width: 5em`. On mobile the control would have rendered the literal word "Menu" at the wrong width. The tell was inside the change itself: the base block's new comment defends `text-align: inherit` as load-bearing **because** "at xsmall the label is hidden by `text-indent: 5em` + `overflow: hidden`" — a premise the same commit falsified.

**Both are the same mistake, and it is not carelessness about CSS.** Both were element-type changes made for landmark reasons — one banner instead of two, no navigation landmark wrapping a lone disclosure button — bolted onto a keyboard-operability ticket. Both are genuine defects. Neither is P131. And the identical argument was already written down, in this ticket's own comment, for keeping the `<nav>`: deleting it "turns a Level A keyboard fix into a layout change on a live marketing site". I wrote that reason, kept the `<nav>` on the strength of it, and then in the same edit did the thing it forbids — twice, once to that very element.

**The fix is a revert, not a repair.** Both elements are back to what they were. Verified afterwards in the CSSOM rather than by assertion: the status header is `position: absolute; top: 52px` with a `display: block` logo, and all four breakpoint rules resolve against the button — the xsmall one included, `overflow: hidden; text-indent: 5em; width: 5em`. The landmark defects are recorded separately in [P137](../closed/137-the-site-header-exposes-two-banner-landmarks-and-a-duplicate-id.md), where the stylesheet work they actually require can be priced honestly.

**What this says about the test tier.** Three findings in one change — the skip link, and these two — were all invisible to a suite that asserts HTML shape. The suite's own header advertises the gap: source greps "cannot see the things that actually break a page: a CSS rule hiding an element". So does this ticket. What enforces accessibility conformance on `apps/website` is tracked in [P138](../verifying/138-nothing-decides-what-enforces-accessibility-conformance-on-apps-website.md).

### One residual raised at risk scoring, measured and closed

The risk review's remaining uncovered item: neither converted control declares `color`, so `_button.scss` now supplies the opener's label colour and its `:hover` colour where it never reached the anchor — potentially visible at every breakpoint except xsmall.

Measured rather than argued, by injecting an `<a class="menu-link">` into the same live nav and comparing computed styles against the button beside it. **Identical both ways**: `rgb(255,255,255)` at rest, `rgb(155,241,255)` on hover. `button { color: _palette(fg-bold) }` and `a { color }` resolve to the same token, as do `button:hover` and `a:hover`. No neutralisation needed, and adding one would be the `text-transform: none` mistake again — a rule written against a difference that does not exist.

The `transition` shorthand does differ (`background-color, box-shadow, color` against `color, border-bottom-color`), same duration and easing. Both animate `color`; the others have no changing value on this control.

### Correction 2026-08-25 — the skip link was outside the inert boundary

The earlier “9 focusable elements with the menu open” measurement did not establish that every background control was inert. Browser automation added under ADR-056 found that Shift+Tab from the focused menu reached the skip link behind the overlay because the link was a sibling before `#wrapper`, not a child of the inert subtree. The skip link is now the first child of `#wrapper`: it remains first in focus order while the menu is closed and becomes inert with the rest of the page while the menu is open. The browser regression rejects focus on the skip link or anything inside the inert wrapper; it does not add the focus trap this ticket explicitly declined.
