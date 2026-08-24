# Problem 139: The home page's API tile is a link with no accessible name

**Status**: Closed
**Reported**: 2026-08-24
**Priority**: 12 (High) — Impact: Major (4) × Likelihood: Likely (3). Impact 4: a link with no accessible name is a Level A failure of both 2.4.4 Link Purpose and 4.1.2 Name, Role, Value. It appears in a screen reader's link list as blank and is announced as "link" with nothing after it, so a non-visual user cannot tell it exists, what it does, or where it goes. Likelihood 3: it is on the home page, the site's most-visited route.
**Origin**: internal
**Effort**: S
**WSJF**: 12.0 — (12 × 1.0) / 1
**JTBD**: JTBD-401
**Persona**: addressr-maintainer

## Description

`src/pages/index.jsx:137` is a self-closing link with no children:

```jsx
<Link to="/api-docs" className="link primary" />
```

It builds to `<a class="link primary" href="/api-docs/"></a>` — an anchor whose content is the empty string. `.link.primary` is the full-tile overlay, so **visually this is the whole "Easy To Use API" tile**: a sighted visitor clicks anywhere on it and reaches the docs. Non-visually there is a nameless link and no indication the tile is interactive at all.

Two details make it worse than a generic missing-name defect:

- **It is the only live one of seven.** Six sibling `<Link className="link primary" />` calls sit commented out in the same file. So five of the six tiles are not links, one is, and nothing distinguishes them without a mouse — the affordance is carried entirely by the pointer cursor.
- **The name is sitting right there.** Each tile's `<header className="major">` holds an `<h3>` ("Easy To Use API") and a `<p>`. The link has no relationship to either.

## Investigation Tasks

- [x] Give the link a name from its visible heading with `aria-labelledby`.
- [x] Delete the six commented-out sibling links; they had no runtime behaviour and no committed restoration plan.
- [x] Pin every emitted anchor's accessible name in the built-output tier.
- [x] Keep the existing whole-tile overlay for this narrow repair; replacing it would add a visual and interaction redesign to a naming defect.

## Root Cause Analysis

The full-tile overlay pattern separates each link from the visible content that describes it. The API tile's Gatsby link was self-closing, so it emitted an empty anchor with no accessible-name relationship to the adjacent heading.

The generic failing test exposed the same root cause on the first tile: its data.gov.au overlay link contained only whitespace. Fixing only the reported API instance would have left the same Level A failure live on the same page.

## Workaround

Before the fix, a non-visual visitor could use the separately named `API Docs` menu or footer link. No equivalent reliable workaround existed for discovering the unnamed data.gov.au tile link.

## Fix Released

Released to `master` on 2026-08-24. Both live full-tile links now take their accessible names from their visible `<h3>` headings via `aria-labelledby`; the six inactive commented placeholders are removed.

The built-output regression test failed before the fix on exactly the data.gov.au and API tile anchors, then passed after a clean Gatsby build. Local verification: website tests 26/26, JavaScript tests 668/668, and browser role queries resolved exactly one `Australian Data Source` link and one `Easy To Use API` link with the expected destinations.

Production verification on 2026-08-24 fetched `https://addressr.io/` and observed both exact relationships and destinations in the emitted markup: `aria-labelledby="australian-data-source-title"` on the data.gov.au anchor and `aria-labelledby="easy-to-use-api-title"` on `/api-docs/`, with both referenced visible headings present. P139 is closed on that evidence.

## Related

- [P126](../closed/126-two-footer-links-render-without-an-href-on-every-page.md) — anchors that are not links. This is the inverse: a link that is not nameable.
- [P138](../open/138-nothing-decides-what-enforces-accessibility-conformance-on-apps-website.md) — `jsx-a11y/anchor-has-content` is exactly this rule, and would have caught it at author time.
