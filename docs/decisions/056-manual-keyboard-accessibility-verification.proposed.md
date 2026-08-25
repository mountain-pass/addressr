---
status: 'proposed'
date: 2026-08-25
human-oversight: unconfirmed
decision-makers: [Tom Howard]
consulted: []
informed: []
reassessment-date: 2026-11-25
---

# Manual keyboard accessibility verification

## Context and Problem Statement

The website's skip link had seven passing static assertions while activation left focus on the link. The checks proved that the link existed, came first in focus order and targeted a unique element; none proved that focus actually moved.

Source lint and built-output assertions cannot establish interaction outcomes such as focus movement, focus return, Escape handling or whether background content is inert. Those behaviours need an explicit owner.

## Decision Drivers

- Verify the user-observable keyboard outcome rather than the presence of supporting markup.
- Avoid presenting green automation as accessibility conformance.
- Keep the verification proportionate to the small Gatsby site and its current CI cost.
- Give behavioural accessibility tickets a concrete completion requirement.

## Considered Options

1. **Require a manual keyboard pass** — exercise the affected interaction in a browser before closing its ticket.
2. **Add browser automation now** — use Playwright, axe-core or Pa11y as a third automated mechanism.
3. **Rely on lint and built-output assertions** — infer behaviour from markup and generated artefacts.

## Decision Outcome

Chosen option: **“Require a manual keyboard pass”**, because it directly observes the behaviour that the existing automated checks proved unable to establish, without adding a browser-based CI mechanism now.

A behavioural accessibility ticket does not close until its affected keyboard interaction has been exercised in a browser and the result recorded. This is a chosen verification instrument, not a claim that automation covers the behaviour.

## Consequences

### Good

- Completion evidence covers the interaction users actually experience.
- Green lint and build checks cannot silently stand in for keyboard behaviour.
- The requirement adds no browser dependency or CI runtime.

### Neutral

- The pass applies to behavioural changes, not every content or styling change.
- Source lint and built-output tests retain their separate responsibilities.

### Bad

- Manual evidence is slower, less repeatable and easier to omit than automation.
- It does not provide unattended regression detection.
- Results can vary by browser unless the evidence names what was exercised.

## Confirmation

1. A ticket changing keyboard behaviour records the browser and the affected interaction exercised before closure.
2. The pass covers the relevant observable outcomes, such as Tab order, activation, focus movement or return, Escape and background inertness.
3. Automated accessibility output states that keyboard behaviour is not covered.
4. A ticket cannot use passing lint or built-output assertions as its sole evidence for an interaction outcome.

## Pros and Cons of the Options

### Require a manual keyboard pass

- Good: observes the exact behaviour at minimal setup cost.
- Bad: provides no unattended regression signal.

### Add browser automation now

- Good: repeatable and capable of observing focus behaviour.
- Bad: adds a browser, CI cost and another mechanism before the current site needs it.

### Rely on lint and built-output assertions

- Good: adds no work.
- Bad: already produced seven green assertions over broken focus behaviour.

## Reassessment Criteria

- A keyboard defect escapes a recorded pass.
- Browser automation becomes affordable or is adopted for another reason.
- Manual passes are repeatedly omitted or cannot be reproduced.
- The website gains enough interactive components that manual coverage no longer scales.
- The website framework or navigation model changes.

## Related

- [ADR-054](054-source-accessibility-linting.proposed.md) — author-time markup ownership.
- [ADR-055](055-built-output-css-selector-reachability.proposed.md) — build-time CSS reachability ownership.
- [P131](../problems/closed/131-the-site-menu-cannot-be-opened-or-closed-by-keyboard-on-any-page.md) — the interaction repair that exposed the static-check blind spot.
- [P140](../problems/open/140-a-route-change-moves-no-focus-so-the-next-tab-resumes-mid-page.md) — current behavioural accessibility work governed by this decision.
