# Problem 141: Three smaller WCAG findings on the website, from one review

**Status**: Closed
**Reported**: 2026-08-24
**Priority**: 6 (Medium) — Impact: Moderate (3) × Likelihood: Unlikely (2). Impact 3: three independent conformance gaps, each affecting a distinct population — heading-navigating screen-reader users, anyone relying on the uptime figure without seeing it, and forced-colors users. None blocks a task. Likelihood 2: each affects a narrower group than the Level A defects tracked separately.
**Origin**: internal
**Effort**: S
**WSJF**: 6.0 — (6 × 1.0) / 1
**JTBD**: JTBD-401
**Persona**: addressr-maintainer

## Description

Three findings from the same accessibility review that produced [P131](../closed/131-the-site-menu-cannot-be-opened-or-closed-by-keyboard-on-any-page.md), [P132](../closed/132-white-text-on-all-six-accent-tiles-fails-contrast-and-someone-has-been-patching-it-by-hand.md), [P137](../open/137-the-site-header-exposes-two-banner-landmarks-and-a-duplicate-id.md), [P139](../closed/139-the-home-pages-api-tile-is-a-link-with-no-accessible-name.md) and [P140](../closed/140-a-route-change-moves-no-focus-so-the-next-tab-resumes-mid-page.md). Grouped because each is small, none blocks a task, and splitting them would make five WSJF rows out of an afternoon's work. They are otherwise unrelated — fix them independently.

### 1. The GitHub ribbon is an `<h4>` that heads nothing (1.3.1 Info and Relationships)

`Header.js` opens every page with `<h4 className="ribbon"><a>Find us on GitHub</a></h4>`. It is a decorative corner ribbon; it introduces no section, and it is the **first** heading in the document, so every page's heading outline starts at level 4 and then jumps up to the `<h1>`. A user navigating by heading meets a phantom section before the page title. It wants to be a link in a container, not a heading.

### 2. The uptime badge's alt text omits the number the badge exists to show (1.1.1 Non-text Content)

The Shields.io image is `alt="Uptime Robot ratio (30 days)"` — which names the _kind_ of thing shown and not the value. The image renders a percentage; a non-visual user gets the label and never the figure, which is the entire information content. Compounding it: the value is baked into a remote image, so no static alt text can stay correct. Either fetch the ratio and render it as text, or state plainly in the alt that the current figure is at the linked status page.

### 3. Pseudo-element icons vanish in forced-colors mode (1.4.11 Non-text Contrast)

The hamburger glyph on the menu button and the ribbon's decorative corners are drawn with `:before`/`:after` and background colours. Windows High Contrast / forced-colors mode overrides background colours and drops background images, so these disappear — the menu button becomes a bare word with no icon, and at xsmall, where `text-indent: 5em` displaces the label off-canvas, **it becomes a control with nothing visible in it at all**. The accessible name survives (text-indent does not hide from accname), so this is a visual failure, not a naming one — but it is the worst case of the three.

A related gap worth deciding in the same sitting: the site defines no `prefers-reduced-motion` handling, and `main.scss` ships transitions and a `reveal-header` keyframe animation. Not a conformance failure at this scale — 2.3.3 is AAA and nothing here flashes — but it is one media query.

## Investigation Tasks

- [x] Ribbon: demote to a non-heading element. Check `_header.scss:399` — `.ribbon` styling is class-based, so the tag should be free to change, but verify rather than assume. That assumption is what produced both regressions in [P137](../open/137-the-site-header-exposes-two-banner-landmarks-and-a-duplicate-id.md).
- [x] Badge: decide between fetching the figure and rendering it as text, or an alt that stops implying it conveys a value. Note the badge is a remote third-party image on every page — worth pricing that separately while here.
- [x] Forced colors: add a `@media (forced-colors: active)` treatment that preserves a visible menu control and ribbon outline. Verify in the mode; this cannot be checked from source.
- [x] Decide on `prefers-reduced-motion`. One media query disabling transitions and the header animation, or a recorded decision not to.

## Root Cause Analysis

The ribbon reused a heading element for styling even though `.ribbon` was already the complete visual hook. The remote badge exposed only a generic label while its current value was available solely at the linked status page. The menu then depended on a background-image pseudo-element at the same xsmall breakpoint that moved its native label off-canvas, leaving no forced-colors fallback. Motion preferences had never been represented in the stylesheet.

## Fix Released

Implemented on 2026-08-26. The ribbon is now a non-heading container, and both badge instances honestly direct users to the linked page for the current 30-day ratio without adding a runtime status fetch. In forced-colors mode the xsmall menu exposes its native text label, while the ribbon uses a current-colour border and drops its decorative pseudo-elements. A reduced-motion media query removes site transitions and animations.

The Gatsby build emits seven routes. Built-output checks assert the ribbon structure and both badge names. Chromium checks exercise the 360px menu fallback, the ribbon outline at a wider viewport and the reduced-motion styles. ADR-055 also caught and drove removal of the `h4 a` selector orphaned by the semantic correction. Local verification passed 32 website assertions and all eight Chromium journeys.

Production verified on 2026-08-26 at `https://addressr.io/`: the ribbon is a non-heading `div`, and both live uptime badges expose the reviewed accessible name. Release run 32857781056 for commit `78bc90da` completed successfully; `website-build`, both build-and-test jobs, `engine-floor` and `release` passed, while `check-deps` remained the known advisory failure.

## Related

- [P132](../closed/132-white-text-on-all-six-accent-tiles-fails-contrast-and-someone-has-been-patching-it-by-hand.md) — the contrast findings from the same review.
- [P138](../open/138-nothing-decides-what-enforces-accessibility-conformance-on-apps-website.md) — none of these would be caught by the current mechanism either.
