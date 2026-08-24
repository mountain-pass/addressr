# Problem 140: A route change moves no focus, so the next Tab resumes mid-page

**Status**: Open
**Reported**: 2026-08-24
**Priority**: 9 (Medium) — Impact: Moderate (3) × Likelihood: Likely (3). Impact 3: WCAG 2.4.3 Focus Order (Level A) as it applies to client-side routing — the new page is never announced and keyboard position is inherited from the page that was left. Not a hard block: the content is reachable, just not findable without hunting. Likelihood 3: every internal navigation on the site, for every keyboard and screen-reader user.
**Origin**: internal
**Effort**: S
**WSJF**: 9.0 — (9 × 1.0) / 1
**JTBD**: JTBD-401
**Persona**: addressr-maintainer

## Description

Gatsby routes client-side. Following an internal link swaps the page content without a document load, and nothing in this site handles what that does to focus or to assistive technology:

- **Focus stays where it was.** After following the footer's link to `/pricing/`, focus is still on the footer link — which no longer exists. The browser drops focus to `<body>`, so the next Tab starts from the top of the _new_ page while the viewport shows wherever the old scroll position landed. A user who navigated from the footer must Tab through the whole header again.
- **Nothing is announced.** A full page load makes a screen reader read the new title. A client-side route change does not. There is no live region and no focus move, so the navigation is silent: the reader is still describing the page they left.

The remedy is standard and small — on route change, move focus to the `<main id="content">` landmark added in [P131](../closed/131-the-site-menu-cannot-be-opened-or-closed-by-keyboard-on-any-page.md), which already carries `tabIndex="-1"` for exactly this reason. Announcing the new page title through a polite live region is the usual companion.

## Investigation Tasks

- [ ] Implement focus-on-route-change. Gatsby's `onRouteUpdate` in `gatsby-browser.js` is the hook; the target already exists. Watch the ordering — Gatsby restores scroll position on the same tick, and focusing an element scrolls it into view, so the two can fight.
- [ ] Decide whether a title announcement is wanted as well, or whether focusing a named landmark is enough. Doing both can produce a double announcement.
- [ ] Check the interaction with the menu. `handleNavigateFromMenu` deliberately closes the menu **without** returning focus to the opener, precisely so it does not fight a route transition. Whatever lands here has to be the thing that takes over in that case, or menu navigation ends up with no focus target at all.
- [ ] Verify by keyboard across an internal navigation, not by assertion. The lesson from P131 is on the record: seven green assertions about a skip link that did not move focus.

## Related

- [P131](../closed/131-the-site-menu-cannot-be-opened-or-closed-by-keyboard-on-any-page.md) — added the `<main id="content">` target this needs, and demonstrated the failure mode of testing focus statically.
