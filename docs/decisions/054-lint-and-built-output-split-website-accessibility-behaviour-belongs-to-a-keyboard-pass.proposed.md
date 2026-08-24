---
status: 'proposed'
date: 2026-08-24
human-oversight: unconfirmed
decision-makers: [Tom Howard]
consulted: []
informed: []
supersedes-clause: 053#eslint-ignore-phase-1
reassessment-date: 2026-11-24
---

# Lint and built output split website accessibility; behaviour belongs to a keyboard pass

> Captured via /wr-architect:capture-adr (foreground-lightweight aside-invocation per ADR-032, derived-substance amendment 2026-07-06 / RFC-045). Section content was derived by the capturing agent from the in-session decision context; human-oversight: unconfirmed until ratified at the /wr-architect:review-decisions drain.

## Context and Problem Statement

[ADR-053](053-website-imported-as-an-app-with-hosting-unchanged.proposed.md) imported the addressr.io marketing site to `apps/website` and, at `:101`, obliged the tree to be ignored in the ESLint flat config **"for phase 1"**. It named `jsx-a11y` "the obvious later addition… so the omission reads as sequencing rather than oversight", and set itself a criterion: if the deferral was never revisited, it "was a deferral dressed as a decision".

Within 72 hours the deferral was tested three times, and each ticket said so at the time:

1. **Two footer links rendered without an `href` on every page** ([P126](../problems/closed/126-two-footer-links-render-without-an-href-on-every-page.md)) — "`jsx-a11y` would have caught this at author time". The rule is literally `anchor-is-valid`.
2. **The site menu could not be opened or closed by keyboard, on any page** ([P131](../problems/closed/131-the-site-menu-cannot-be-opened-or-closed-by-keyboard-on-any-page.md)) — WCAG 2.1.1, Level A.
3. **Two live CSS regressions shipped inside P131's own fix** ([P137](../problems/open/137-the-site-header-exposes-two-banner-landmarks-and-a-duplicate-id.md)), caught only by architecture review.

P131 was resolved by extending the built-output test tier — and **that choice was never recorded, so it was never weighed.** This record is the weighing. Three measured facts made it necessary:

- **`rendered-output.test.mjs` asserts HTML shape only.** Its own header states the limit: source greps "cannot see the things that actually break a page: a CSS rule hiding an element." Both P137 regressions are exactly that. Twenty-five assertions, all green, both defects live on production. **A linter would have caught neither.**
- **A linter would have caught what that tier could not.** The empty footer anchors, and the still-live unnamed tile link on the home page ([P139](../problems/open/139-the-home-pages-api-tile-is-a-link-with-no-accessible-name.md)), are `anchor-is-valid` and `anchor-has-content`.
- **Neither can see behaviour.** P131's skip link carried **seven dedicated assertions, all passing**, on a build where activating it left focus on the link. Present, fragment resolving to exactly one id, first in focus order — every property except the one that matters, which is that focus moves.

The two observed failure classes are **disjoint**, and the third is reachable by neither. So the question is not "should we lint" but what each mechanism is responsible for, and what is left over.

## Decision Drivers

- Three defects in three days on a public marketing site, one Level A, all reaching production.
- The failure classes are disjoint. No single mechanism covers both, which is measured rather than argued.
- The repository's posture is accessibility-first WCAG AA, enforced on every UI edit by a PreToolUse gate. The one tree containing UI had no automated enforcement.
- Green must not be readable as conformance. The skip link is the proof that it currently is.
- ADR-053's phase-1 costs for lint adoption are real, unpaid, and **larger than that record estimated** — see the measurements below.
- [P084](../problems/open/084-eslint-10-and-unicorn-72-leave-a-deliberate-lint-debt-with-no-ci-gate.md) ruled on sequencing for exactly this move: "Green first, or land the gate with findings explicitly baselined."

## Considered Options

1. **Lint and built output, with a recorded split; behaviour to a keyboard pass (chosen)**
2. **Built-output CSS-reachability check only** — extend the existing tier. Targets the observed regressions; nothing to install; nothing at author time.
3. **Source lint only (`jsx-a11y`)** — what P126 and P131 both asked for. Blind to both CSS regressions.
4. **Status quo** — fix instances as found.
5. **Browser-driven behavioural checking (Playwright / axe-core / Pa11y), as the primary or third mechanism** — the mechanism that actually found the P131 skip-link defect.

Options 1–4 were costed in the question put to the maintainer, who chose 1. **Option 5 was absent from that question and is recorded here because its absence would otherwise turn a decision into a default** — the mechanism that found the defect that mattered cannot be left off the list.

## Decision Outcome

Chosen option: **"Lint and built output, with a recorded split; behaviour to a keyboard pass"**, because the two failure classes observed are disjoint and each mechanism is blind to the other's. Option 3 catches one of the three defects; option 2 catches two; only both catches all three. Option 4 was in force while all three shipped.

### The split

- **Source lint owns author-time markup rules.** Anchors without `href`, links with no accessible name, missing labels, role and attribute misuse.
- **Built output owns emitted-artefact properties.** Page titles, `lang`, absence of credentials, no-anchor-without-`href` in the built HTML, and selector reachability.
- **Behaviour is owned by a keyboard pass, and a ticket of this shape does not close without one.** Focus movement, focus return, `inert`, Escape. This is an owner, not a gap: option 5 was available and is rejected below on cost, so the human pass is a chosen instrument rather than a leftover.

### What "adopt the linter" actually costs, measured 2026-08-24

ADR-053 read this as one ignore entry. It is not. With `'apps/website/**'` removed from `globalIgnores` and nothing else changed:

| Measurement                                                              | Result                                                               |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `npx eslint apps/website`                                                | **53,405 findings** across 214 files                                 |
| `npx eslint apps/website/src apps/website/test apps/website/gatsby-*.js` | **81 findings** (55 errors, 26 warnings) across 17 files             |
| `.js` files containing JSX                                               | **11 of 11 are `Parsing error: Unexpected token <`**                 |
| `index.jsx`, `404.tsx`                                                   | **"File ignored because no matching configuration was supplied"**    |
| `prettier/prettier` findings                                             | **0** with `.prettierignore`'s `apps/website/` entry, **11** without |

Four consequences follow, and the third is decisive:

1. **The 53,405 figure is `public/` and `.cache/`.** Both are in `apps/website/.gitignore` and neither is in `globalIgnores`, so the single ignore entry was carrying build output as well as source. Whatever replaces it **must** ignore those two paths explicitly, or the first run buries 81 real findings under 53,324 findings in generated bundles.
2. **The source tree is tractable** — 81 findings, 17 files. Nothing here justifies a long sweep; P084's "green first" is affordable at this scale.
3. **Removing the ignore entry delivers ZERO `jsx-a11y` coverage.** Every `.js` file containing JSX fails to parse, and `.jsx`/`.tsx` are not matched by the config's file globs at all. Every file the plugin targets is unparseable or unmatched. The lint half of this decision is **inert** until a JSX parser and widened file globs land. This is the substance ADR-053's one-line bullet concealed.
4. **`eslint-plugin-prettier` honours `.prettierignore`** — measured in both directions. ADR-053's `.prettierignore` entry therefore stands unchanged, and this record does not retire it. Without it, adopting lint would reformat the tree during a change whose premise is that nothing visual moves.

### What the reachability check can and cannot be

An earlier draft of this record claimed a "media-query-aware" forward check would catch both P137 regressions. **That is false, and the correction is the most load-bearing thing here.**

- **`.status-header` losing `#header`** is catchable forward — the element ended up matching no rule at all — **but only under element-level matching.** A class-token scan finds `status-header` inside the selector `#header.status-header` and reports it resolved. Which semantics is meant is load-bearing and must be stated.
- **The dead `nav` breakpoint blocks are not catchable forward at any breakpoint.** The div carried `class="nav"`, the widened base rule matched it, and a base rule carries no media constraint — so the element had ≥1 matching rule everywhere. What died was `@media { nav { … } }` matching **zero elements**. That is only visible in the **reverse** direction, as an orphaned rule.
- **Unscoped reverse is not viable here.** `main.scss` imports `font-awesome.min.css` (hundreds of unused icon classes by construction), `api-docs.js` imports `swagger-ui-react/swagger-ui.css`, and `libs/_skel.scss` carries a Meyer reset selecting elements the site never renders. Orphans by the hundred, none of them defects.

So the check runs **both directions**, with the reverse direction scoped to site-authored SCSS and third-party bundles excluded **by name**, not by an allowlist that grows. A **diff-scoped** variant — a rule that matched before a change and matches nothing after — is the alternative worth pricing: it catches the `nav` defect without the orphan flood, at the cost of maintaining a baseline.

## Consequences

### Good

- All three observed defects become catchable, two of them before a commit exists.
- The unnamed home-page tile link gets an owner — a live Level A defect with a mechanism assigned.
- The split is written down, so a future escape is diagnosable: you can ask which mechanism owned it and repair the mechanism, not only the instance.
- Naming behaviour's owner converts an unstated assumption into a recorded one. The skip link failed precisely because that assumption was made silently.
- The measurements above turn ADR-053's one-line deferral into a costed piece of work, so the next person does not rediscover the parse errors.

### Neutral

- The built-output tier already exists and already runs in `website-build`, so half of this adds an assertion rather than a mechanism.
- The parser question was always going to be answered before any `.tsx` was linted. This record only fixes when.

### Bad

- **Two mechanisms, two ways to be wrong.** A split not kept current is worse than one mechanism, because each side can assume the other covers a class.
- **The lint half is a parser project, not a config edit.** Measured above: zero coverage without it. Anyone reading "adopt jsx-a11y" as cheap will be wrong by an order of magnitude.
- **Un-ignoring routes a never-linted tree into an autofixing pre-commit gate.** `package.json:158` runs `eslint --fix` on `*.{js,jsx}` **unscoped by directory**, so the first staged edit to a website component gets an unreviewed rewrite plus a hard block on everything non-autofixable. This is the amplification P084 sequenced against, and it is the binding reason for the precondition below — not the separate hazard that `npm run lint` rewrites 40 files, which nothing in this decision requires anyone to run.
- **A new top-level `files:` block makes 17 config entries**, falsifying ADR-014's Decision Outcome count of 16, and adding `eslint-plugin-jsx-a11y` makes its enumerated plugin list 10. Both are factual corrections in place with retain-as-history under ADR-049, authorised by this record. (The comment at `eslint.config.js:32-33` attributes the 16 to ADR-014's **Confirmation**. That is wrong — ADR-014's Confirmation pins two things, neither of them a count. Do not let it force a worse config shape than the corpus requires.)
- **A reachability check has a false-positive mode this record does not solve**: classes applied only at runtime by JavaScript, or emitted by a third-party component, legitimately resolve to no rule.
- **New dependencies**: `eslint-plugin-jsx-a11y`, a JSX/TypeScript parser, and a CSS parser for the reachability check. Each enters the ADR-015 `dry-aged-deps` freshness surface and `.dry-aged-deps.json`.

## Confirmation

1. `eslint.config.js` no longer ignores `apps/website` **source**, and **does** ignore `apps/website/public/` and `apps/website/.cache/` explicitly. `npx eslint apps/website` reports on the order of 10² findings, not 10⁴. A five-figure count means the build output is being linted.
2. **`npx eslint apps/website/src` produces zero `Parsing error: Unexpected token <`, and does not report `.jsx`/`.tsx` as having no matching configuration.** Until this holds, the lint half is inert regardless of whether the plugin is installed — this is the criterion that catches a plugin configured but not reaching anything.
3. Lint **fails on the unnamed tile link** in `apps/website/src/pages/index.jsx` (`jsx-a11y/anchor-has-content`). If it passes, criterion 2 is not really met.
4. **Precondition, discharged with a number, not a promise**: at the moment the ignore entry leaves, `npx eslint apps/website/src apps/website/test` is green, or every remaining finding is explicitly baselined and the count recorded here. The baseline figure to beat is **81 across 17 files**, measured 2026-08-24. This does not import P084's whole worklist — `n/hashbang` and the `license-audit.mjs` damage are P084's and block nothing here.
5. A reachability assertion exists and is **mutation-tested against both real defects**: it must fail when `id="header"` is removed from the status strip, **and** fail when a breakpoint block's `nav` selector stops matching. A single-direction check demonstrably cannot pass both — that is the point of testing both.
6. The reverse direction's third-party exclusions are named literals (`font-awesome`, `swagger-ui`, the Meyer reset), not a growing allowlist.
7. Whatever reports a green accessibility run states, in the same place, that behaviour is not covered by it.

## Pros and Cons of the Options

### Lint and built output, with a recorded split (chosen)

- Good, because it is the only combination covering all three observed defects.
- Good, because the split makes a future escape diagnosable.
- Bad, because it is two setups and two maintenance surfaces, with a seam for a responsibility to fall through.
- Bad, because the lint half's true cost was only discovered by measuring, after the option was chosen.

### Built-output reachability only

- Good, because it targets the class observed failing twice and adds no dependency.
- Good, because it lives in a tier that already runs on every push.
- Bad, because it catches nothing until a build exists, and is blind to the empty-link class two tickets asked to be caught.

### Source lint only

- Good, because it fires at author time, and `anchor-is-valid` / `anchor-has-content` are exactly the observed markup defects.
- Bad, because it would have caught neither P137 regression — a linter cannot see that a stylesheet rule stopped matching.

### Status quo

- Good, because it costs nothing today.
- Bad, because it was in force while all three defects shipped. That is a measurement, not a prediction.

### Browser-driven behavioural checking

- Good, because it is the **only** option that covers the class that produced the worst defect — seven green assertions over a skip link that did not move focus.
- Good, because it would also subsume much of the built-output tier's coverage.
- Bad, because it adds a browser to CI on a tree whose entire build currently costs one `gatsby build`, and this repo has recorded scepticism about checks nobody reads (ADR-051).
- Bad, because it does not remove the need for either chosen mechanism: it is slower than lint at author time and no better than assertions at artefact properties.
- **Rejected on scope, not on merit.** Revisit under reassessment criterion 5.

## Reassessment Criteria

1. **A fourth defect of an already-assigned class escapes both mechanisms.** That falsifies the split — this record's actual contribution — rather than the choice to have two mechanisms.
2. **The built-output tier stops running, or stops failing loud.** Half of this rests entirely on `test:website` and the `website-build` job. Deletion, `continue-on-error`, or a narrowed glob evaporates the mechanism silently. This repo has that exact failure on file ([P098](../problems/open/098-five-test-files-reached-by-no-runner-assertions-never-execute.md)), and `scripts/assert-test-files.mjs:30` records a measured proof about `test:website`'s globs specifically.
3. **The reachability check's exclusion list gains an entry for anything other than a named third-party bundle.** Stated as a mechanism because "routinely suppressed" cannot be measured and would never fire. Exemption-list growth as the signal follows ADR-047 and ADR-049.
4. **`jsx-a11y`'s rules are downgraded to `warn` en masse.** That is P084's recorded workaround, and it would leave this record claiming author-time enforcement that blocks nothing.
5. **Browser-driven behavioural checking becomes affordable.** Option 5 was rejected on scope; if that changes, behaviour gains a mechanism and the "keyboard pass" owner is superseded.
6. **A third mechanism is adopted regardless.** "A split between two" is then the wrong cut, and the title goes with it.
7. **P084's sweep lands, so the rule-scoping compromise recorded here can be narrowed.** Note the framing: discharging the precondition is Confirmation criterion 4, not a reason to reopen. Only the opportunity to _tighten_ the scoping is.
8. **The website leaves Gatsby, or gains a component library.** Either changes what "the classes the components emit" means. A component library also floods the reachability check with classes the site does not own.
9. **The phase-2 Cloudflare Pages cutover lands.** [P128](../problems/open/128-cloudflare-obfuscation-defeats-the-visible-address-for-no-js-users.md) already proved Cloudflare rewrites emitted output at the edge, so a tier asserting on the origin has a different relationship to what a user receives once Pages is in front of it.

## Related

- [ADR-053](053-website-imported-as-an-app-with-hosting-unchanged.proposed.md) — **superseded in part.** Its `:101` bullet obliges ignoring `apps/website` in the flat config "for phase 1", and phase 1 has not ended; this record ends that obligation early, declared via `supersedes-clause: 053#eslint-ignore-phase-1`. The `.prettierignore` half of that same bullet **stands unchanged** — measured above as load-bearing. No amendment otherwise: nothing in ADR-053 became false, its `reassessment-date` of 2026-11-23 is not due, and its accessibility-backlog criterion is discharged in the affirmative rather than falsified.
- [ADR-014](014-eslint-flat-config.accepted.md) — **widened, not superseded.** Flat-config-over-Biome stands; the config shape, plugin mechanism and `globalIgnores` all stand. Its Decision Outcome entry count (16 → 17) and plugin list (9 → 10) become factual corrections in place under ADR-049, with precedent in ADR-014's own 2026-08-09 plugin-list edit. Widening `lint-staged`'s `*.{js,jsx}` glob to reach `.tsx` would touch ADR-014's Confirmation criterion 2 and needs clause-supersession, not a correction — so this record does **not** widen it, and `404.tsx` stays unlinted at author time, covered only by built output.
- [ADR-048](048-moved-path-referrers-resolved-by-executable-guard.proposed.md) — the precedent for standing alone rather than amending a parent whose scope this outlives, and for guards running outside the surfaces they protect. The built-output tier already does.
- [ADR-051](051-a-check-with-no-reader-but-the-maintainer-is-not-a-control.proposed.md) — adjacent, not overlapping. It governs who _reads_ a check; this governs what a check _covers_.
- [ADR-015](015-dry-aged-deps.accepted.md) — the new dependencies named above enter its freshness surface.
- [P138](../problems/open/138-nothing-decides-what-enforces-accessibility-conformance-on-apps-website.md) — the ticket whose blocking task was this decision. Its remaining tasks are the implementation.
- [P084](../problems/open/084-eslint-10-and-unicorn-72-leave-a-deliberate-lint-debt-with-no-ci-gate.md) — sequencing authority for the lint half; Confirmation criterion 4.
- [P139](../problems/open/139-the-home-pages-api-tile-is-a-link-with-no-accessible-name.md) — a live defect the lint half must catch; Confirmation criterion 3.
- [P137](../problems/open/137-the-site-header-exposes-two-banner-landmarks-and-a-duplicate-id.md) — the two regressions the built-output half must catch; Confirmation criterion 5.
- [P140](../problems/open/140-a-route-change-moves-no-focus-so-the-next-tab-resumes-mid-page.md) — behavioural, so this record deliberately assigns it to the keyboard pass and not to either mechanism.
- [P141](../problems/open/141-three-smaller-wcag-findings-on-the-website-from-one-review.md) — open findings; the forced-colors item is another one neither mechanism can see.
