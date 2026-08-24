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

- [x] **Blocked on the maintainer**: choose between A/B/C/D. **Answered 2026-08-24: C — both, with a recorded split.**
- [x] Write the decision record. This is a **new** ADR, not an amendment to ADR-053 — nothing in ADR-053 became false, and its own `reassessment-date` (2026-11-23) is not yet due.
- [ ] If B or C: the CSS-reachability check needs a shape that a mutation test can falsify. "Every emitted class resolves to ≥1 rule" would have caught `.status-header` losing `#header`; confirm it would also have caught the dead `nav` breakpoint blocks, where the class still resolved at base and only the media-query rules died. If it would not, the check is weaker than the evidence demands.
- [ ] Whichever is chosen, state in the record what it does **not** cover, so a green run is never read as conformance. The skip-link case is the argument: seven passing assertions about a broken feature.

## Related

- ADR-053 — the phase-1 deferral this reopens.
- [P126](../closed/126-two-footer-links-render-without-an-href-on-every-page.md), [P131](../closed/131-the-site-menu-cannot-be-opened-or-closed-by-keyboard-on-any-page.md), [P137](137-the-site-header-exposes-two-banner-landmarks-and-a-duplicate-id.md) — the three tests of the deferral.
- [P098](098-five-test-files-reached-by-no-runner-assertions-never-execute.md) — `test:precommit` is invoked by nothing. Same family: a tier believed to be enforcing something, that is not.

## Decided 2026-08-24 — and the implementation is bigger than this ticket assumed

The maintainer chose **both mechanisms with a recorded split**. It is written up as ADR-054, _Lint and built output split website accessibility; behaviour belongs to a keyboard pass_ — `status: proposed`, `human-oversight: unconfirmed` until the review drain ratifies it. That record supersedes one clause of the website-import decision: the obligation to ignore `apps/website` in the ESLint flat config "for phase 1". The `.prettierignore` half of the same bullet stands, and is load-bearing — see below.

An architecture review of the draft found five issues. Two changed what this ticket is asking for.

### The reachability check I proposed cannot catch one of the two defects that motivated it

This ticket's third task asked whether "every emitted class resolves to ≥1 rule" would catch the dead `nav` breakpoint blocks, and said that if not, the check is weaker than the evidence demands. **It does not, and no amount of media-query awareness fixes it.** The div carried `class="nav"`, the widened base rule matched it, and a base rule has no media constraint — so the element had a matching rule at every breakpoint. What died was a rule matching _zero elements_, which is only visible looking the other way, as an orphan.

And unscoped orphan detection is unusable here: `main.scss` imports `font-awesome.min.css`, `api-docs.js` imports `swagger-ui-react/swagger-ui.css`, and `libs/_skel.scss` carries a Meyer reset. Hundreds of orphans, none of them defects. So the check runs both directions with the reverse side scoped to site-authored SCSS and third-party bundles excluded by name, or it uses a diff-scoped form — a rule that matched before a change and matches nothing after.

### Adopting the linter delivers zero coverage today, and that is measured

The estimate here and in the website-import decision was "one ignore entry". With `'apps/website/**'` removed from `globalIgnores` and nothing else changed:

| Measurement                                | Result                                                        |
| ------------------------------------------ | ------------------------------------------------------------- |
| `npx eslint apps/website`                  | 53,405 findings across 214 files                              |
| source only (`src`, `test`, `gatsby-*.js`) | 81 findings (55 errors, 26 warnings), 17 files                |
| `.js` files containing JSX                 | 11 of 11 are `Parsing error: Unexpected token <`              |
| `index.jsx`, `404.tsx`                     | "File ignored because no matching configuration was supplied" |
| `prettier/prettier`                        | 0 with the `.prettierignore` entry, 11 without                |

Reading them in order:

- **The 53,405 is `public/` and `.cache/`.** Gitignored, but not eslint-ignored once the entry goes. The replacement must exclude them explicitly or 81 real findings sit under 53,324 in generated bundles.
- **The source tree is tractable at 81 findings.** "Green first" is affordable at this scale, which is the sequencing the lint-debt ticket demanded.
- **Every file `jsx-a11y` targets is unparseable or unmatched.** So the linter half is _inert_ until a JSX parser and widened file globs land. This is the real work, and it is not what either this ticket or the import decision priced.
- **`eslint-plugin-prettier` honours `.prettierignore`**, tested in both directions. Without that entry, adopting lint reformats the tree during a change whose whole premise is that nothing visual moves.

### Remaining tasks

- [ ] Add a JSX/TypeScript parser and widen the config's file globs to `.jsx`/`.tsx`. **Nothing else in the lint half works until this does**, and a green run before it would be meaningless.
- [ ] Replace the blanket ignore with one scoped to `apps/website/public/` and `apps/website/.cache/`.
- [ ] Get the source tree green or baseline the 81 findings explicitly, recording the count. Do not import the whole lint-debt backlog — the shebang and quoted-URL damage recorded there block nothing here.
- [ ] Build the reachability check to the shape above, and mutation-test it against **both** real defects. A single-direction check demonstrably cannot pass both, which is the point of testing both.
- [ ] Note that widening `lint-staged`'s `*.{js,jsx}` glob to reach `.tsx` would touch the flat-config decision's own confirmation criterion, so it needs clause supersession rather than a factual correction. ADR-054 deliberately does not do it, which leaves `404.tsx` unlinted at author time and covered only by built output.
