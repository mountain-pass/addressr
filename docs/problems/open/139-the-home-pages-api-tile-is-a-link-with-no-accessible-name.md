# Problem 139: The home page's API tile is a link with no accessible name

**Status**: Open
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

- [ ] Give the link a name. `aria-labelledby` pointing at the tile's `<h3>` id is the cheapest option that keeps the name in sync with the visible heading; visually-hidden text is the alternative if ids are awkward to generate. Do **not** use `aria-label` with hand-written copy — it duplicates the heading and will drift from it.
- [ ] Decide about the six commented-out siblings while here. Either they come back — in which case the same fix applies six more times and belongs in a shared component — or they go, and the file stops implying five other tiles were meant to be clickable.
- [ ] Pin it: assert no emitted anchor has an empty accessible name. This is the natural sibling of the no-anchor-without-href assertion added in [P126](../closed/126-two-footer-links-render-without-an-href-on-every-page.md), and it belongs in the same tier.
- [ ] Consider whether the whole-tile overlay link is the right pattern at all. A visible link inside the tile is nameable by construction and does not need the pattern to be got right twice.

## Related

- [P126](../closed/126-two-footer-links-render-without-an-href-on-every-page.md) — anchors that are not links. This is the inverse: a link that is not nameable.
- [P138](138-nothing-decides-what-enforces-accessibility-conformance-on-apps-website.md) — `jsx-a11y/anchor-has-content` is exactly this rule, and would have caught it at author time.
