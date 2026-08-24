# Style Guide

**Last reviewed**: 2026-08-24
**human-oversight**: confirmed
**oversight-date**: 2026-08-24
**Status**: Ratified

> **Read this first.** This guide **describes the conventions already in `apps/website`**; it does not
> propose new ones. It was written because the style gate blocks `.jsx`/`.tsx` edits until it exists, and it
> was blocking a WCAG Level A fix ([P125](problems/closed/125-every-page-of-the-website-ships-without-a-title-element.md)).
> Everything here was read out of the tree, and every number was measured rather than asserted.
>
> **Ratified by the maintainer 2026-08-24**, and `wr-style-guide:agent` now reads it as binding rather than
> advisory. Two things a reader should know about what that ratification covers:
>
> - It ratifies a **description**, not a design. Where the existing CSS is inconsistent this guide says so
>   rather than picking a winner, and those open questions stay open — ratifying the description does not
>   settle them. They are listed under _Known gaps_.
> - The Do/Don't rules are now enforceable. The **live defects** those rules describe are tracked as tickets
>   and are not conventions to preserve — see
>   [P131](problems/closed/131-the-site-menu-cannot-be-opened-or-closed-by-keyboard-on-any-page.md) and
>   [P132](problems/open/132-white-text-on-all-six-accent-tiles-fails-contrast-and-someone-has-been-patching-it-by-hand.md).
>   A reviewer meeting one of them is looking at a known defect, not at a rule being broken for the first
>   time.

## Scope

One surface: `apps/website`, a Gatsby 5 marketing site imported by
[ADR-053](decisions/053-website-imported-as-an-app-with-hosting-unchanged.proposed.md). Nothing else in this
repo ships UI. The site derives from a HTML5 UP template, which is why the architecture below is older than
the rest of the repo's conventions and should not be read as a house style the maintainer chose.

## CSS architecture

Sass (`.scss`), compiled by `gatsby-plugin-sass`, organised in four layers under
`apps/website/src/assets/scss/`:

| Layer         | Holds                                                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `libs/`       | `_vars.scss` (all tokens), `_functions.scss`, `_mixins.scss`, `_skel.scss` (the template's grid/breakpoint engine)                                                              |
| `base/`       | `_page.scss`, `_typography.scss` — element-level defaults                                                                                                                       |
| `components/` | `_button.scss`, `_form.scss`, `_table.scss`, `_tiles.scss`, `_box.scss`, `_list.scss`, `_icon.scss`, `_image.scss`, `_section.scss`, `_spotlights.scss`, `_contact-method.scss` |
| `layout/`     | `_header.scss`, `_footer.scss`, `_menu.scss`, `_main.scss`, `_banner.scss`, `_wrapper.scss`, `_contact.scss`                                                                    |

`main.scss` imports them in that order. Three things the four-layer picture leaves out:

- **`_css-grid.scss`** sits at the scss root in none of the four layers, imported at `main.scss:8`.
- **A sibling `src/assets/css/` directory** exists — `font-awesome.min.css` (live, imported at `main.scss:5`),
  `skel.css`, `ie8.css`, `ie9.css`.
- **`main.scss:6` pulls Source Sans Pro from `fonts.googleapis.com` over the network**, which is the actual
  mechanism behind the type token below and a render-blocking third-party request.

**There is a de-facto fifth layer, and naming it matters.** `main.scss` is not an import manifest: lines
77-237 are ~160 lines of its own rules overriding third-party React widgets — react-autosuggest, react-tabs,
swagger-ui, plus `.enterprise-cta__address`. "Where do I put an override for a vendor component" is a real
recurring question and this is the honest answer. It is also not a coincidence that three of the tree's
hardcoded colours live there: unnamed layers accumulate exceptions.

Legacy dead weight, flagged rather than removed because removing is a change and this is a description:
`ie8.scss`, `ie9.scss`, and their `.css` counterparts.

**Not BEM, not utility-first, not CSS modules.** Plain semantic class names (`.menu-link`, `.major`,
`.inner`, `.price-styles`) with descendant selectors. No Tailwind, no styled-components, no CSS modules.

Styling is _mostly_ global — but not entirely, and the qualifier is load-bearing. An earlier draft of this
paragraph ended "there is no component-scoped CSS anywhere in the tree", which is false: `index.jsx` and
`Header.js` carry inline `style={{}}` props covering colour, padding and sizing. Those are component-scoped
styling of the least overridable kind. See the hardcoded-values table below.

## Design tokens

All tokens live in one place — `libs/_vars.scss` — as Sass maps, read through accessor functions
(`_palette(highlight)`, `_size(border-radius)`, `_font(family)`). The accessor discipline is real and worth
keeping: most of the tree goes through it, and a token change propagates.

**But it is not universal, and an earlier draft of this guide claimed it was.** That draft said "there are no
hardcoded hex values scattered through components" and "there is no component-scoped CSS anywhere in the
tree". Both are false. The grep behind them matched 6-digit hex in `.scss` only — missing named colours,
3-digit hex, `rgba()`, a second `hsl()` on the very next line, and JSX inline styles entirely. There are at
least ten hardcoded colour values across five files:

| Location                                        | Value                                         |
| ----------------------------------------------- | --------------------------------------------- |
| `main.scss:188` and `:189`                      | `hsl(208, 99%, 50%)`, twice, in the same rule |
| `main.scss:200`                                 | `background: #fff`                            |
| `main.scss:183`                                 | `color: GrayText` (system keyword)            |
| `layout/_header.scss:353-354`                   | `background: rebeccapurple; color: white`     |
| `layout/_header.scss:59`                        | `rgba(0, 0, 0, 0.15)`                         |
| `layout/_menu.scss:102`                         | `rgba(0, 0, 0, 0)`                            |
| `libs/_mixins.scss:219-227`                     | `red`, `blue`, `green` (debug mixin)          |
| `layout/_main.scss:232`                         | `// color: #4caf50` (commented out)           |
| `index.jsx:67,76,103,166` and `Header.js:17,32` | `'black'`, `'#f2f2f2'` — JSX inline styles    |

Strictly there are no CSS modules and no styled-components. But inline `style={{}}` props **are**
component-scoped styling, and they are the least overridable kind there is. Saying otherwise stops a reader
from looking.

### Palette

Dark-first. `bg: #242943` is the ground everything sits on.

| Token                         | Value                                                       | Role                      |
| ----------------------------- | ----------------------------------------------------------- | ------------------------- |
| `bg` / `bg-alt`               | `#242943` / `#2a2f4a`                                       | Page and panel grounds    |
| `fg` / `fg-bold`              | `#ffffff`                                                   | Body and heading text     |
| `fg-light`                    | `rgba(244,244,255,0.2)`                                     | De-emphasised text        |
| `border` / `border-bg`        | `rgba(212,212,255,0.1)` / `…0.035`                          | Hairlines and inset fills |
| `highlight`                   | `#9bf1ff`                                                   | Focus rings, emphasis     |
| `accent1`–`accent6`           | `#6fc3df` `#8d82c4` `#ec8d81` `#e7b788` `#8ea9e8` `#87c5a4` | Decorative                |
| `error` / `success` / `amber` | `#ec8d81` / `#87c5a4` / `#e7b788`                           | Validation states         |

Also present and omitted from the table above when this guide was first drafted: **`dk-accent1: #5393a8`**.

#### Measured contrast — tokens used as FOREGROUND on `bg`

Computed 2026-08-24 with the WCAG 2.x relative-luminance formula, not estimated, and independently
recomputed by a reviewer:

| Pair                    | Ratio       | 3:1 (UI) | 4.5:1 (text) |
| ----------------------- | ----------- | -------- | ------------ |
| `fg` #ffffff            | **14.25:1** | pass     | pass         |
| `highlight` #9bf1ff     | **11.15:1** | pass     | pass         |
| `highlight` on `bg-alt` | **10.24:1** | pass     | pass         |
| `accent1` #6fc3df       | **7.16:1**  | pass     | pass         |
| `error` #ec8d81         | **5.90:1**  | pass     | pass         |

#### Measured contrast — the same tokens used as BACKGROUND

**This table is why the section above must not be read as "the palette is cleared."** An earlier draft of
this guide said "the palette is in good shape" on the strength of the foreground table alone. That sentence
was wrong, and wrong in the most expensive direction: it told a reader that colour contrast had been checked,
at precisely the place where there is a live failure.

`components/_tiles.scss:113-147` sets `accent1`–`accent6` as the home page tile overlay backgrounds, with the
inherited white body text sitting above them:

| Tile background   | White text      | Black text   |
| ----------------- | --------------- | ------------ |
| `accent1` #6fc3df | **1.99:1 FAIL** | 10.55:1 pass |
| `accent2` #8d82c4 | **3.43:1 FAIL** | 6.12:1 pass  |
| `accent3` #ec8d81 | **2.42:1 FAIL** | 8.69:1 pass  |
| `accent4` #e7b788 | **1.82:1 FAIL** | 11.53:1 pass |
| `accent5` #8ea9e8 | **2.34:1 FAIL** | 8.99:1 pass  |
| `accent6` #87c5a4 | **1.99:1 FAIL** | 10.55:1 pass |

All six fail WCAG 1.4.3 (Level AA, 4.5:1) with white text; all six pass with black. This is a **live defect,
not a hypothetical** — and `index.jsx` contains its own evidence: three hand-patched
`style={{ color: 'black' }}` `<strong>` elements sitting on those tiles, someone fixing this one word at a
time while the surrounding `<h3>` and `<p>` text stayed white and stayed failing.

So: the palette is **sound for its dark-ground pairings** and **unresolved for the tile overlays**.

`fg-light` at 20% alpha is excluded from both tables deliberately: alpha compositing makes its effective
ratio depend on what sits behind it, and a single number would be more misleading than none.

### Other tokens

- **Type**: Source Sans Pro, Helvetica, sans-serif. Weight 300 body, 600 bold. Letter-spacing `0.025em`,
  `0.25em` for the alt (small-caps-ish) treatment. Fixed: Courier New.
- **Size**: `border-radius: 4px`, `element-height: 2.75em`, `element-margin: 2em`, `inner: 65em` (the
  container max-width).
- **Duration**: `transition: 0.2s`, `menu: 0.35s`, `banner: 2.5s`.
- **Spacing**: no scale. Spacing is ad-hoc `em` values per component, keyed loosely off `element-margin`.
  **This is the clearest inconsistency in the tree** and the obvious first candidate if the maintainer wants
  to tighten anything.

## Focus indicators — the rule that matters most here

The site removes the native outline in **three** places, not two — `main.scss:104`, `main.scss:190`, and
`_form.scss:87`. That is legitimate **only** because a visible replacement follows, and each has been
measured:

```scss
// components/_form.scss:87,98
outline: 0;
box-shadow: 0 0 0 2px _palette(highlight); // 11.15:1 against bg — passes 1.4.11
```

**Do**: pair every `outline: 0` / `outline: none` with a visible replacement ring of at least 3:1 against
its background, and record the measured ratio.

**Don't**: write a bare `outline: none`. `main.scss:104` does exactly this on
`.react-autosuggest__input--focused`; `_form.scss:96-99` supplies the ring that saves it, but the two live in
different files and nothing connects them. If either moves independently the focus indicator disappears
silently — this is a latent hazard, not a current defect.

The third site, `.react-tabs__tab:focus` at `main.scss:190`, replaces its outline with the hardcoded
`hsl(208, 99%, 50%)` (#0188FE) from the token table above. Measured: **4.04:1** against `bg` and **3.53:1**
against the white `.swagger-wrapper` it actually sits on, so it clears 1.4.11 either way. It is a **token
violation, not a contrast defect** — worth stating precisely so nobody "fixes" a ring that is working.

## Do / Don't

**Rules only, stated without line numbers, and deliberately.** An earlier draft put live defects here with
file:line citations. That was the wrong instrument twice over. Do/Don't is the _normative_ section — a
reviewer diffing a change reads it as the rules — and rules and defects have opposite lifecycles: rules are
meant to persist, defects are meant to be closed. Mixing them means the guide can never be fully satisfied,
and a guide that cannot be satisfied gets skimmed. The line numbers also rotted immediately: the P125 head
fix shifted every one of them.

Instances live in tickets, which are closable. This section describes intent, which is durable.

1. **Interactive controls must be real controls.**
   Don't: an anchor with no `href` carrying an `onClick`. It is not focusable and exposes no role, so the
   control does not exist for a keyboard or a screen reader.
   Do: `<button type="button">`.

2. **`to` is not an HTML attribute.**
   Don't: `<a to="…">`. It renders an anchor with no `href` — inert text that looks like a link.
   Do: `<Link to="…">` for **internal** routes; `<a href="…">` for **external** URLs. Picking the wrong one
   is the common error, so check which it is before reaching for `Link`.

3. **Every link needs an accessible name.**
   Don't: a self-closing `<Link />`, or an anchor whose only child is whitespace.
   Do: give it text, or a visually-hidden label. This bites hardest with the full-tile overlay pattern in
   `_tiles.scss` (`position: absolute; height/width: 100%; z-index: 4`) — that CSS makes an unnamed link
   invisible _and_ focusable, which is the worst combination, and it is the part of the pattern that belongs
   in a style guide.

4. **Use the token accessors rather than raw values.**
   Don't: a literal colour where `_palette()` would serve.
   Do: `_palette(highlight)`.
   **Exceptions, because an absolute rule that correct code breaks gets ignored**: `transparent`,
   `currentColor`, `inherit`, `rgba(0,0,0,0)` for `-webkit-tap-highlight-color`, system keywords, and the
   debug mixin in `libs/_mixins.scss`.

5. **Don't disable a lint rule you cannot re-enable.**
   Don't: an `eslint-disable` for a rule the project does not run. It suppresses nothing and records that the
   author saw the problem.
   Do: fix the code and delete the comment.

**Known live instances of rules 1, 2 and 3** are tracked in tickets rather than listed here — see the
accessibility problems filed against `apps/website`. They are defects awaiting closure, not conventions to
preserve.

## Naming

- SCSS partials: `_kebab-case.scss`, grouped by the four layers above.
- Classes: lowercase, hyphenated, semantic (`.price-styles`, `.swagger-wrapper`, `.menu-link`).
- Components: `PascalCase.js` in `src/components/`. Note `layout.js` is the one lowercase exception.
- Pages: `kebab-case` in `src/pages/`, matching the route.

## Known gaps, deliberately not resolved here

- **No spacing scale.** Ad-hoc `em` values throughout.
- **No dark/light mode.** The site is dark-only; there is no `prefers-color-scheme` handling.
- **Nothing lints accessibility.** `jsx-a11y` is not installed, and `eslint.config.js` puts
  `apps/website/**` in `globalIgnores` — a decision ADR-053 took deliberately for phase 1, recording
  `jsx-a11y` as the obvious later addition.
- **`ie8.scss` / `ie9.scss`** are dead.
- **`_skel.scss`** is the template's own breakpoint engine and is effectively unowned code.

## For the reviewer agent

`wr-style-guide:agent` reads this file, and as of 2026-08-24 it is **ratified**, so the Do/Don't rules are
binding on new work rather than advisory.

Two standing qualifications, because a ratified description is not the same as a clean tree:

- **Existing violations are tracked defects, not precedent.** The tree currently breaks rules 1, 2, 3 and 4
  in known places, recorded in P131, P132 and P126. Meeting one of them in a file is not evidence the rule
  does not apply; do not let it license a new instance.
- **The _Known gaps_ section is genuinely unresolved**, not tacitly approved. Ratification covers the
  description of what the tree does. It does not decide the spacing scale, the dark-only question, or the
  absence of accessibility linting.
