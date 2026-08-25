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

# Browser-automated keyboard accessibility verification

## Context and Problem Statement

The website's skip link had seven passing static assertions while activation left focus on the link. The checks proved that the link existed, came first in focus order and targeted a unique element; none proved that focus actually moved.

Source lint and built-output assertions cannot establish interaction outcomes such as focus movement, focus return, Escape handling or whether background content is inert. Those behaviours need an explicit owner that exercises them in a browser.

## Decision Drivers

- Verify the user-observable keyboard outcome rather than the presence of supporting markup.
- Detect regressions unattended in the existing website pipeline.
- Avoid presenting the scripted interactions as full accessibility conformance.
- Give later behavioural accessibility fixes an executable completion requirement.

## Considered Options

1. **Add Playwright browser automation now** — drive keyboard interactions in Chromium and assert focus and state.
2. **Require a manual keyboard pass** — exercise the affected interaction in a browser before closing its ticket.
3. **Rely on lint and built-output assertions** — infer behaviour from markup and generated artefacts.

## Decision Outcome

Chosen option: **“Add Playwright browser automation now”**, because Playwright can drive the keyboard and assert focus, focus return, Escape handling and inert state in a real browser. Axe-core and Pa11y can report accessibility rules but cannot independently establish those interaction outcomes.

The checks run in Chromium against Gatsby's built site in the existing `website-build` path. A later behavioural accessibility fix adds its focused browser regression before ticket closure. Green covers only the scripted interactions, not full keyboard, screen-reader, cross-browser or WCAG conformance.

## Consequences

### Good

- The demonstrated keyboard behaviours gain repeatable unattended regression coverage.
- Assertions observe browser focus and state rather than inferring them from markup.
- Later behavioural fixes leave an executable check behind.

### Neutral

- Browser checks apply to behavioural changes, not every content or styling change.
- Source lint and built-output tests retain their separate responsibilities.

### Bad

- Playwright and Chromium add a dependency, browser installation and CI runtime.
- Browser checks carry flake and timing risk.
- Chromium-only coverage does not establish cross-browser behaviour.

## Confirmation

1. Playwright with Chromium runs against Gatsby's built site in the existing `website-build` path and fails the job on error.
2. A skip-link test activates the link by keyboard, asserts that focus moves to `main#content`, then presses Tab and asserts that focus stays inside `main#content` rather than returning to repeated navigation.
3. A menu test covers keyboard activation, `aria-expanded`, focus moving into `nav#menu` or its first operable item, Tab and Shift+Tab staying out of the inert background, Escape dismissal, inert removal and focus return to the opener.
4. Each later behavioural accessibility fix adds its focused browser regression before ticket closure.
5. Browser-test output states that green covers only scripted interactions, not full keyboard, screen-reader, cross-browser or WCAG conformance.

## Pros and Cons of the Options

### Add Playwright browser automation now

- Good: repeatably observes focus and state in a real browser on every website build.
- Bad: adds a dependency, Chromium runtime and flake surface.

### Require a manual keyboard pass

- Good: observes the exact behaviour without adding CI machinery.
- Bad: provides no unattended regression signal and is easier to omit.

### Rely on lint and built-output assertions

- Good: adds no work.
- Bad: already produced seven green assertions over broken focus behaviour.

## Reassessment Criteria

- A scripted keyboard defect escapes the browser check.
- Chromium-only results diverge from a supported browser.
- Browser CI reliability or cost becomes unacceptable.
- The website framework or navigation model changes.

## Related

- [ADR-054](054-source-accessibility-linting.proposed.md) — author-time markup ownership.
- [ADR-055](055-built-output-css-selector-reachability.proposed.md) — build-time CSS reachability ownership.
- [P131](../problems/closed/131-the-site-menu-cannot-be-opened-or-closed-by-keyboard-on-any-page.md) — the interaction repair that exposed the static-check blind spot.
- [P140](../problems/verifying/140-a-route-change-moves-no-focus-so-the-next-tab-resumes-mid-page.md) — current behavioural accessibility work governed by this decision.
