# Problem 140: A route change moves no focus, so the next Tab resumes mid-page

**Status**: Closed
**Reported**: 2026-08-24
**Priority**: 9 (Medium) — Impact: Moderate (3) × Likelihood: Likely (3). Impact 3: WCAG 2.4.3 Focus Order (Level A) as it applies to client-side routing — the new page is never announced and keyboard position is inherited from the page that was left. Not a hard block: the content is reachable, just not findable without hunting. Likelihood 3: every internal navigation on the site, for every keyboard and screen-reader user.
**Origin**: internal
**Effort**: S
**WSJF**: 9.0 — (9 × 1.0) / 1
**JTBD**: JTBD-401
**Persona**: addressr-maintainer

## Description

Gatsby routes client-side. Following an internal link swaps the page content without a document load. The original report correctly identified the focus failure but incorrectly said nothing was announced:

- **Focus moves to Gatsby's wrapper, not the page content.** A browser-driven menu navigation to `/pricing/` leaves focus on `#gatsby-focus-wrapper`; the next Tab lands on the new page's skip link and repeats the page chrome.
- **Gatsby already announces the route.** Its built-in `#gatsby-announcer` is an assertive atomic live region and updates to `Navigated to <first h1>`. Adding a second live region would duplicate the announcement rather than fix this ticket.

The remedy is standard and small: after Gatsby finishes its own route focus work, move focus to the `<main id="content">` landmark added in [P131](../closed/131-the-site-menu-cannot-be-opened-or-closed-by-keyboard-on-any-page.md), which already carries `tabIndex="-1"` for exactly this reason. Gatsby remains the sole announcement owner.

## Investigation Tasks

- [x] Implement focus-on-route-change through Gatsby's `onRouteUpdate`, excluding initial loads and same-path hash changes.
- [x] Keep Gatsby's existing route announcer as the sole title announcement; do not add a duplicate live region.
- [x] Preserve menu navigation's no-return behavior and move focus to the destination main landmark after Gatsby's wrapper focus runs.
- [x] Verify a real keyboard menu navigation in Chromium: route, inert removal, focus, announcement and next-Tab containment.

## Root Cause Analysis

Gatsby focuses `#gatsby-focus-wrapper` during its client-side route lifecycle. A synchronous `onRouteUpdate` focus call briefly reached `main#content` and was then overwritten by Gatsby's own focus step. Deferring the destination focus by one animation frame makes it the final route focus owner. `{ preventScroll: true }` leaves scroll restoration with Gatsby instead of coupling focus management to a second scroll policy.

## Workaround

Before the fix, keyboard users could activate the new page's skip link after navigation to reach `main#content`, at the cost of an extra repeated-chrome interaction.

## Fix Released

Released to `master` on 2026-08-25. `gatsby-browser.js` now focuses `main#content` after pathname changes, excluding initial loads and same-page hash navigation. Gatsby's built-in announcer remains the only route announcement.

The Playwright regression failed before the fix because `main#content` was inactive. A synchronous first implementation then exposed the ordering race: Gatsby reclaimed focus on `#gatsby-focus-wrapper`, and the next Tab landed on the skip link. The animation-frame implementation passes the full journey and leaves the next Tab inside the destination main content.

Production verification at `https://addressr.io/pricing/` on 2026-08-25 23:17 AEST confirmed that menu navigation focuses `main#content`, clears the menu's inert state and updates Gatsby's sole announcer to `Navigated to Pricing`. The browser regression also confirms that the following Tab remains within the destination main content.

## Related

- [P131](../closed/131-the-site-menu-cannot-be-opened-or-closed-by-keyboard-on-any-page.md) — added the `<main id="content">` target this needs, and demonstrated the failure mode of testing focus statically.
