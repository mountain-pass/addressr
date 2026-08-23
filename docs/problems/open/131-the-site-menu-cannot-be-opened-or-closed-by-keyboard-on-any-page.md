# Problem 131: The site menu cannot be opened or closed by keyboard, on any page

**Status**: Open
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
