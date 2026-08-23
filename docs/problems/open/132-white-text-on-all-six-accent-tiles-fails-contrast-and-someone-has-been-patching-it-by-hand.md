# Problem 132: White text on all six accent tiles fails contrast, and someone has been patching it by hand

**Status**: Open
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

- [ ] Decide between the three options above. This is a visual-design call and belongs to the maintainer, not to whoever implements it.
- [ ] Whatever is chosen, **measure it** — record the resulting ratios in `docs/STYLE-GUIDE.md`'s background-contrast table rather than asserting the fix works.
- [ ] Sweep the three `color: 'black'` inline styles in `index.jsx`. If they survive the fix they mask it.
- [ ] Check `fg-light` (`rgba(244,244,255,0.2)`) while in here. It is deliberately excluded from both contrast tables in the style guide because alpha compositing makes a single number misleading, but 20% alpha white on any of these accents will be far below 4.5:1 wherever it is used over one.
- [ ] Add a design-token contrast assertion so this cannot silently return. The style guide now carries measured tables, but nothing executable checks them — a token edit can falsify the document without failing anything.

## Notes

**On how this was nearly missed.** The first draft of `docs/STYLE-GUIDE.md` contained the sentence "The palette is in good shape", written on the strength of a contrast table that measured every token as a **foreground on the page background**. Six of them are used as backgrounds, and that table said nothing about it. A style-guide review caught it. Had it been ratified as written, the guide would have told every future reviewer that colour contrast on this site had been checked and cleared — at precisely the surface where it fails.

The guide now carries both tables and says the palette is "sound for its dark-ground pairings and unresolved for the tile overlays". This ticket is the unresolved half.

## Related

- [P125](../closed/125-every-page-of-the-website-ships-without-a-title-element.md) — found during that fix and recorded in its Fixed section.
- [P131](131-the-site-menu-cannot-be-opened-or-closed-by-keyboard-on-any-page.md) — the Level A blocker found in the same pass. Higher priority: that one makes navigation impossible, this one makes text hard to read.
- [docs/STYLE-GUIDE.md](../../STYLE-GUIDE.md) — carries the measurements; `human-oversight: unconfirmed`.
