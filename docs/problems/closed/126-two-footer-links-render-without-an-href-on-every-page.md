# Problem 126: Two footer links render without an `href`, on every page

**Status**: Closed — 2026-08-24, fixed inside P131 and pinned by assertion
**Reported**: 2026-08-23
**Priority**: 6 (Medium) — Impact: Minor (2) × Likelihood: Possible (3). Impact 2: two labels in the footer of every page are inert — not focusable, not exposed as links to assistive technology, and doing nothing on click. It is a WCAG failure and a functional one, but the destinations both remain reachable by four other working paths (see below), so it degrades the journey rather than severing it. Likelihood 3: the harm needs someone to try those specific labels rather than the working ones beside them.
**Origin**: internal
**Effort**: S — a two-character fix in one file, plus a guard.
**WSJF**: 6.0 — (6 × 1.0) / 1
**JTBD**: JTBD-004
**Persona**: web-app-developer

## Description

Found during the `apps/website` import ([ADR-053](../../decisions/053-website-imported-as-an-app-with-hosting-unchanged.proposed.md)).

`src/components/Footer.js` lines 31 and 51 write `<a to="...">` where `<a href="...">` is meant. `to` is
Gatsby `<Link>`'s prop, not an anchor attribute. React passes unknown lowercase attributes straight through
to the DOM, so both render as literal `to=` and the anchors have **no `href` at all**.

**Verified on production, not inferred from source:**

```
$ curl -s https://addressr.io/ | grep -o '<a [^>]*>API Docs</a>\|<a [^>]*>RapidAPI</a>'
<a to="https://rapidapi.com/addressr-addressr-default/api/addressr/">API Docs</a>
<a to="https://rapidapi.com/addressr-addressr-default/api/addressr/">RapidAPI</a>
```

An `<a>` without `href` is not a link. It is not focusable, gets no link role, is absent from a screen
reader's links list, and does nothing when clicked or activated. Both sit in the site-wide footer, so this
is every page.

WCAG: 2.1.1 Keyboard (Level A) — the control cannot be reached or operated by keyboard at all. Also 4.1.2
Name, Role, Value, since what looks and reads like a link exposes no link role.

## Why it degrades rather than severs

Worth stating so the severity is not over-read. The RapidAPI destination stays reachable by four working
paths: `Footer.js:26` "Sign up" has a correct `href` to the RapidAPI pricing page **four lines above the
broken one**, `index.jsx:110` and `:116` both link to RapidAPI from the landing page, and `quick-start.js:33`
has a working "Try it now online for free" button. So JTBD-004's critical path survives; two of its signposts
are dead.

## Corrected before filing

An earlier draft of this ticket also listed `Footer.js:42` (`/community-support/`) as a dead link, on the
reasoning that its `createRedirect` is one of the three P122 records as never reaching the built output.
**That is wrong and the check is the reason to state it:**

```
https://addressr.io/community-support/  301 -> https://app.gitter.im/#/room/%23mountainpass-addressr_community:gitter.im
https://addressr.io/signup/             301 -> https://addressr.io/quick-start/
```

Both routes work, served by Netlify UI configuration. The in-repo `createRedirect` calls are dead; the
_routes_ are live. That is a P122 instance — live behaviour with no reproducible source in the repository —
not a third broken link. Filing it as dead would have sent someone to fix something that works.

## Investigation Tasks

- [ ] Change `to=` to `href=` at `Footer.js:31` and `:51`. Both point at the same RapidAPI URL as the
      working "Sign up" link four lines above, so the destination needs no research.
- [ ] Decide whether these should be `<a>` or Gatsby `<Link>`. They are external URLs, so `<a>` is right;
      the bug is likely a copy-paste from an adjacent `<Link>`.
- [ ] Add a guard asserting no `<a>` in built output carries a `to=` attribute, and that every `<a>` with
      link text has an `href`. Source-level linting would also catch this — `jsx-a11y/anchor-is-valid` is
      exactly this rule — which is an argument for the jsx-a11y adoption ADR-053 defers.
- [ ] Sweep for the same mistake elsewhere; two instances in one file suggests a habit rather than a slip.

## Notes

Not fixed during the import. ADR-053's premise is that the move changes no rendered output, and this changes
it on every page. Recorded so the omission is deliberate.

The deeper point is that `jsx-a11y` would have caught this at author time. ADR-053 defers adding it and
records that as sequencing rather than oversight; this ticket is the first evidence of what the deferral
costs. Related: [P125](../closed/125-every-page-of-the-website-ships-without-a-title-element.md), a Level A failure in
the same tree found the same day, also invisible to source-level review.
