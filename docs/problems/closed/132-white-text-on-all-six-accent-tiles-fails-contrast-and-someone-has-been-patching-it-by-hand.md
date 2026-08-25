# Problem 132: White text on all six accent tiles fails contrast, and someone has been patching it by hand

**Status**: Closed
**Reported**: 2026-08-24
**Priority**: 9 (Medium) — Impact: Moderate (3) × Likelihood: Certain (3, capped at Possible for scoring consistency with other realised defects). Impact 3: WCAG 1.4.3 Contrast (Minimum) is **Level AA**, and this fails on the home page's primary content tiles — the surface a prospect reads while deciding whether to evaluate the product. Not 4: the text is legible to most sighted readers in good conditions, and no other page or function is affected. Likelihood: realised and live, measured 2026-08-24.
**Origin**: internal
**Effort**: S — the fix is a colour decision plus one rule. The work is deciding which of three options, not typing it.
**WSJF**: 9.0 — (9 × 1.0) / 1
**JTBD**: JTBD-004
**Persona**: web-app-developer

## Description

Found while writing [docs/STYLE-GUIDE.md](../../STYLE-GUIDE.md) during the [P125](../closed/125-every-page-of-the-website-ships-without-a-title-element.md) fix, and it is a finding I nearly buried myself — see Notes.

`apps/website/src/assets/scss/components/_tiles.scss:113-147` uses `accent1`–`accent6` as the background of the home page's content tiles. The inherited body colour is `_palette(fg)`, white. Measured with the WCAG 2.x relative-luminance formula:

| Tile background   | White text | Black text |
| ----------------- | ---------- | ---------- |
| `accent1` #6fc3df | **1.99:1** | 10.55:1    |
| `accent2` #8d82c4 | **3.43:1** | 6.12:1     |
| `accent3` #ec8d81 | **2.42:1** | 8.69:1     |
| `accent4` #e7b788 | **1.82:1** | 11.53:1    |
| `accent5` #8ea9e8 | **2.34:1** | 8.99:1     |
| `accent6` #87c5a4 | **1.99:1** | 10.55:1    |

WCAG 1.4.3 requires **4.5:1** for body text. All six fail with white. All six pass comfortably with black.

## The tree already knows

`apps/website/src/pages/index.jsx` carries three `style={{ color: 'black', fontWeight: '800' }}` props on `<strong>` elements sitting on those tiles. Someone hit this, fixed the words they were looking at, and moved on. The surrounding `<h3>` and `<p>` text on the same tiles is still white and still failing.

That is the most useful fact in this ticket: the defect has already been noticed and partially patched at the leaf, which is why it has never been fixed at the token. It also means a fix must sweep those three inline styles, or they become redundant overrides that hide whether the real fix worked.

## The decision to make

Not obviously "switch the text to black" — the tiles are a designed surface and this is a visual call, not just a conformance one:

- **Darken the accent tokens** so white passes. Keeps the light-on-dark treatment consistent with the rest of the site, which is dark-first throughout. Changes the palette's character; these accents are the only bright colour on the site.
- **Switch tile text to black.** Passes everywhere immediately and matches what the three hand-patches already do. But black text on a dark-themed site is a jarring exception, and it is the reason those patches look like patches.
- **Add a scrim** — darken the overlay behind the text rather than changing either colour. Preserves the accent hues exactly. Costs an extra layer and needs its own measurement.

The third is the one that preserves the design intent, so it is worth pricing before defaulting to the second.

## Investigation Tasks

- [x] Choose the shared dark scrim so the accent hues and the site's light-on-dark treatment remain intact.
- [x] Measure the conservative white-image composites and record all six ratios in `docs/STYLE-GUIDE.md`.
- [x] Remove the three `color: 'black'` inline patches from `index.jsx`.
- [x] Confirm `fg-light` is not used in tile content.
- [x] Add a built-browser contrast assertion over the emitted pseudo-element colours, opacity and stacking order.

## Root Cause Analysis

The existing dark `:after` scrim painted below the 85% accent `:before` layer, where it could not darken the colour directly behind the text. Three individual `<strong>` elements were then patched to black while their surrounding headings, paragraphs and links continued to inherit white. Contrast ownership had drifted from the shared tile layer into leaf markup.

## Fix Released

Implemented on 2026-08-25. The accent layer now paints at z-index 1 and a 65% `bg` scrim paints above it at z-index 2, below the z-index 3 content and z-index 4 full-tile link. Against a pure-white underlying image, the six resulting white-text ratios range from 6.18:1 to 7.81:1; the scrim alone provides a conservative 4.64:1 floor.

The three inline black patches are gone. A Chromium regression reads the built pseudo-element styles, verifies the paint order and recomputes all six ratios against the brightest possible image input. Local verification passed a clean seven-route Gatsby build, 30 built-output assertions and the focused Chromium contrast journey.

Production verified on 2026-08-25 at `https://addressr.io/`: all six live home-page tile headers expose the fixed stacking order (`::before` z-index 1 at 85% opacity, `::after` z-index 2 with `rgba(36, 41, 67, 0.65)`, content z-index 3), white header text, and computed ratios of 6.37, 7.81, 7.00, 6.18, 6.76 and 6.38. Release run 32855144646 for commit `fbc8adf4` completed successfully; `check-deps` remained the known advisory failure.

## Notes

**On how this was nearly missed.** The first draft of `docs/STYLE-GUIDE.md` contained the sentence "The palette is in good shape", written on the strength of a contrast table that measured every token as a **foreground on the page background**. Six of them are used as backgrounds, and that table said nothing about it. A style-guide review caught it. Had it been ratified as written, the guide would have told every future reviewer that colour contrast on this site had been checked and cleared — at precisely the surface where it fails.

The guide now carries the original raw-token range and the fixed tile composites, so a foreground-only measurement cannot hide this usage again.

## Related

- [P125](../closed/125-every-page-of-the-website-ships-without-a-title-element.md) — found during that fix and recorded in its Fixed section.
- [P131](../closed/131-the-site-menu-cannot-be-opened-or-closed-by-keyboard-on-any-page.md) — the Level A blocker found in the same pass. Higher priority: that one makes navigation impossible, this one makes text hard to read.
- [docs/STYLE-GUIDE.md](../../STYLE-GUIDE.md) — ratified guide carrying the measured composites and executable-check boundary.
