# Problem 138: Nothing decides what enforces accessibility conformance on `apps/website`

**Status**: Open
**Reported**: 2026-08-24
**Priority**: 12 (High) — Impact: Major (4) × Likelihood: Likely (3). Impact 4: this repository's stated posture is accessibility-first and WCAG AA, enforced on every UI edit by a global gate; the one tree containing UI has no automated enforcement at all, so the posture rests entirely on whether a reviewer happens to look. Likelihood 3: three defects invisible to the current mechanism were found in a single change, within one day of the tree landing.
**Origin**: internal
**Effort**: S — the work is one decision record. The mechanisms it chooses between are each S–M, and belong to their own tickets.
**JTBD**: JTBD-401
**Persona**: addressr-maintainer
**WSJF**: 12.0 — (12 × 1.0) / 1

## Description

ADR-053 excluded `apps/website` from the ESLint flat config for phase 1 and named `jsx-a11y` "the obvious later addition… so the omission reads as sequencing rather than oversight". The deferral has now been tested three times in three days, and each ticket said so at the time:

- [P126](../closed/126-two-footer-links-render-without-an-href-on-every-page.md): "`jsx-a11y` would have caught this at author time" — the rule is literally `anchor-is-valid`.
- [P131](../closed/131-the-site-menu-cannot-be-opened-or-closed-by-keyboard-on-any-page.md): "this ticket is evidence for taking that up".
- [P137](137-the-site-header-exposes-two-banner-landmarks-and-a-duplicate-id.md): two CSS regressions shipped inside an accessibility fix.

That third case is the one that makes this a real decision rather than a to-do. **P131 was resolved by extending the built-output test tier — and that choice was never recorded, which means it was never weighed.** The evidence says it is at best half an answer:

- `rendered-output.test.mjs` asserts **HTML shape**. Its own header advertises the limit: source greps "cannot see the things that actually break a page: a CSS rule hiding an element."
- Both P137 regressions are exactly that — a rule that stopped matching. Twenty-five assertions, all green, both defects live.
- And the skip link in P131 **had seven dedicated assertions, all passing, while it did not work.** Present, resolvable, first in focus order — every property except the one that matters, which is that focus moves.

So the mechanism in place catches emitted markup and nothing else, and a linter would have caught neither P137 regression. Both gaps are now measured rather than hypothesised.

## The decision to make

- **A — adopt `jsx-a11y` for `apps/website`.** Catches the P126 class at author time, which is what two tickets asked for. ADR-053's recorded costs are still live: no TypeScript parser and no JSX config, so `.tsx` goes unlinted while stray `.js`/`.jsx` collect `eslint-plugin-n` and `unicorn/filename-case` findings that fight React conventions.
- **B — keep the built-output tier as the sole mechanism, and extend it to CSS reachability**: assert that every class the components emit resolves to at least one rule in the built stylesheet. Aimed squarely at P137. Catches nothing at author time.
- **C — both, with the split of responsibility recorded**: source lint for author-time markup rules, built-output for emitted-artefact properties.
- **D — status quo**: leave it undocumented and keep fixing instances as they are found.

The architecture review's advisory lean is **C, with B load-bearing** — B addresses the class actually observed failing, A is cheap once the parser question is settled and is the thing two tickets have now requested. This is the maintainer's to pin, not the reviewer's and not mine.

## Investigation Tasks

- [ ] **Blocked on the maintainer**: choose between A/B/C/D. Everything below waits on it.
- [ ] Write the decision record. This is a **new** ADR, not an amendment to ADR-053 — nothing in ADR-053 became false, and its own `reassessment-date` (2026-11-23) is not yet due.
- [ ] If B or C: the CSS-reachability check needs a shape that a mutation test can falsify. "Every emitted class resolves to ≥1 rule" would have caught `.status-header` losing `#header`; confirm it would also have caught the dead `nav` breakpoint blocks, where the class still resolved at base and only the media-query rules died. If it would not, the check is weaker than the evidence demands.
- [ ] Whichever is chosen, state in the record what it does **not** cover, so a green run is never read as conformance. The skip-link case is the argument: seven passing assertions about a broken feature.

## Related

- ADR-053 — the phase-1 deferral this reopens.
- [P126](../closed/126-two-footer-links-render-without-an-href-on-every-page.md), [P131](../closed/131-the-site-menu-cannot-be-opened-or-closed-by-keyboard-on-any-page.md), [P137](137-the-site-header-exposes-two-banner-landmarks-and-a-duplicate-id.md) — the three tests of the deferral.
- [P098](098-five-test-files-reached-by-no-runner-assertions-never-execute.md) — `test:precommit` is invoked by nothing. Same family: a tier believed to be enforcing something, that is not.
