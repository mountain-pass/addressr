---
status: 'proposed'
date: 2026-08-25
human-oversight: confirmed
oversight-date: 2026-08-25
decision-makers: [Tom Howard]
consulted: []
informed: []
reassessment-date: 2026-11-25
---

# Built-output CSS selector reachability

## Context and Problem Statement

The website's existing built-output tests assert generated HTML shape. During the keyboard-menu repair, two CSS regressions passed every assertion: removing `id="header"` made `#header.status-header` unreachable, and changing a `<nav>` to a `<div class="nav">` orphaned breakpoint rules nested under the `nav` element selector.

The first defect is visible by checking whether each emitted element matches a site-authored selector. The second is visible only in reverse, by checking whether a formerly relevant site-authored selector matches any emitted element. A forward-only check cannot cover both.

## Decision Drivers

- Catch both selector-reachability failures already observed in production work.
- Test the built HTML and CSS relationship rather than source tokens.
- Avoid false positives from bundled icon, Swagger and reset stylesheets.
- Fail loudly in the existing website build pipeline.

## Considered Options

1. **Check selector reachability in both directions** — match emitted elements to site CSS and site CSS to emitted elements, excluding named third-party bundles.
2. **Check emitted elements only** — report elements that match no site-authored selector.
3. **Check only selector regressions in the current diff** — compare matching before and after a change.
4. **Keep HTML-shape assertions only** — rely on review for CSS reachability.

## Decision Outcome

Chosen option: **“Check selector reachability in both directions”**, because the two real regressions are observable from opposite directions. A one-direction check would knowingly leave one of them uncovered.

The reverse check is limited to site-authored SCSS. Third-party bundles are excluded by name rather than by a growing selector allowlist.

## Consequences

### Good

- Both observed CSS regressions become reproducible build failures.
- The check runs against what Gatsby emits, including selector composition that source token scans miss.
- Named bundle exclusions keep the signal focused on CSS the site owns.

### Neutral

- Existing built-output assertions continue to own page titles, language, links and other emitted-HTML properties.
- Source accessibility linting and interactive behaviour remain separate concerns.

### Bad

- A CSS parser becomes a new dependency.
- Runtime-only classes and third-party components can create false positives if ownership boundaries drift.
- Two-direction matching is more complex than the existing HTML assertions.

## Confirmation

1. The reachability check runs in the existing website test/build path and fails the job on error.
2. Removing `id="header"` from the status header makes the check fail.
3. Changing the responsive navigation element so the breakpoint `nav` selectors match nothing makes the check fail.
4. Reverse-direction exclusions name third-party bundles such as Font Awesome, Swagger UI and the Meyer reset; they do not form a growing per-selector allowlist.
5. A zero-file or zero-selector corpus fails rather than passing silently.

## Pros and Cons of the Options

### Check selector reachability in both directions

- Good: covers both observed failure classes.
- Bad: needs explicit ownership boundaries and a CSS parser.

### Check emitted elements only

- Good: simpler and catches the lost status-header styling.
- Bad: cannot detect orphaned responsive `nav` rules.

### Check only selector regressions in the current diff

- Good: avoids the existing orphan-selector corpus.
- Bad: requires a reliable before/after baseline and misses pre-existing defects.

### Keep HTML-shape assertions only

- Good: adds no mechanism.
- Bad: preserves a demonstrated blind spot.

## Reassessment Criteria

- A selector-reachability defect escapes the check.
- Exclusions grow beyond named third-party bundles.
- The website gains runtime styling or a component library that invalidates static ownership assumptions.
- A diff-scoped or browser-driven check provides the same coverage with less maintenance.
- The website leaves Gatsby or its built-output test path stops failing loudly.

## Related

- [ADR-054](054-source-accessibility-linting.proposed.md) — author-time markup ownership.
- [ADR-056](056-browser-automated-keyboard-accessibility-verification.proposed.md) — behavioural keyboard ownership.
- [P137](../problems/open/137-the-site-header-exposes-two-banner-landmarks-and-a-duplicate-id.md) — the two observed selector regressions used as mutations.
- [P138](../problems/open/138-nothing-decides-what-enforces-accessibility-conformance-on-apps-website.md) — implementation ticket.
