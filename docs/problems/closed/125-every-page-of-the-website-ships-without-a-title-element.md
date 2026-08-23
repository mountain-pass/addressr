# Problem 125: Every page of addressr.io ships without a `<title>` element

**Status**: Closed — 2026-08-24, fixed and verified on production
**Reported**: 2026-08-23
**Priority**: 12 (High) — Impact: Moderate (3) × Likelihood: Certain (4 capped at Likely for scoring consistency with realised defects). Impact 3: WCAG 2.4.2 Page Titled is **Level A**, the lowest bar, and it fails on every page of the public marketing site. A screen-reader user hears the URL or nothing when the tab opens, and browser tabs and bookmarks are unlabelled. **Corrected 2026-08-24:** an earlier draft added "search engines have no title to index — which also costs the site the discovery path JTBD-004 depends on". That over-reached. No job in the corpus documents search discovery as a desired outcome; what JTBD-004 actually records is narrower — a visitor arriving on "a stale link, bookmark or search result", which is **re-entry into an already-documented journey**, not acquisition. The indexing benefit of this fix is real and incidental, and is deliberately not claimed as justification, so an accessibility ticket does not become the carrier for unscoped SEO work. The Impact 3 score never rested on that clause: a Level A failure on every page of the public site carries it alone. Not 4: no data loss, no service outage, and the pages are otherwise navigable. Likelihood: this is not a probability. It is realised and live on all five pages as of 2026-08-23.
**Origin**: internal
**Effort**: S — install and wire one plugin, or port five pages to Gatsby's Head API. Verifying is one grep over build output.
**WSJF**: 12.0 — (12 × 1.0) / 1
**JTBD**: JTBD-004
**Persona**: web-app-developer

## Description

Found during the `apps/website` import ([ADR-053](../../decisions/053-website-imported-as-an-app-with-hosting-unchanged.proposed.md)) while checking an unrelated architect finding about two competing Gatsby configs.

**Measured against production, not inferred from source:**

```
/              <<< NO TITLE ELEMENT >>>
/pricing/      <<< NO TITLE ELEMENT >>>
/quick-start/  <<< NO TITLE ELEMENT >>>
/download/     <<< NO TITLE ELEMENT >>>
/api-docs/     <<< NO TITLE ELEMENT >>>
```

A local `gatsby build` of the imported tree reproduces it exactly — same five pages, no `<title>` — so it is a property of the site, not of the CDN.

## Root cause

Five pages (`index.jsx`, `pricing.js`, `quick-start.js`, `download.js`, `api-docs.js`) import `react-helmet` directly and render `<Helmet><title>…</title></Helmet>`. `react-helmet` **is** declared in `package.json` and resolves fine.

What is missing is the bridge. Helmet needs `gatsby-plugin-react-helmet` to inject its output into server-rendered HTML, and that plugin is **not in `package.json`** and **not in the config Gatsby actually loads**. So Helmet runs client-side, mutates the DOM after hydration, and contributes nothing to the static document the crawler, the screen reader on first paint, and the browser tab all read.

**Why it looks configured but is not** — this is the same defect class as [P122](../open/122-three-redirect-mechanisms-in-the-website-and-none-reach-the-built-site.md), in the same tree. Two Gatsby configs ship:

|                                         | `gatsby-config.js` | `gatsby-config.ts` |
| --------------------------------------- | ------------------ | ------------------ |
| Loaded by Gatsby                        | **no**             | **yes**            |
| References `gatsby-plugin-react-helmet` | yes                | no                 |
| Google Analytics / Ads IDs              | yes                | no                 |
| `gatsby-plugin-offline`                 | yes                | no                 |

Confirmed by reading Gatsby's own compiled output at `apps/website/.cache/compiled/gatsby-config.js`, which carries the `.ts` content. So the file a maintainer would open — the obvious filename, the one that mentions Helmet and analytics — has never executed. Neither `gatsby-plugin-react-helmet` nor `gatsby-plugin-offline` is even installed; the build survives only because nothing reads the file that names them.

ADR-053 deletes `gatsby-config.js` for this reason. **Deleting it does not fix this ticket** — it removes the misleading artefact, which is what makes the gap visible instead of apparently-configured.

## Investigation Tasks

- [x] Decide the mechanism: add `gatsby-plugin-react-helmet` to `package.json` and the `.ts` config, or port the five pages to Gatsby 5's native Head API and drop `react-helmet` entirely. The Head API is the maintained path and removes a dependency; the plugin is the smaller diff.
- [x] Give each page a distinct, descriptive title. 2.4.2 wants a title that describes topic or purpose, so five identical titles would technically pass and practically fail.
- [x] Add a build-output assertion that every emitted `index.html` contains a non-empty `<title>`, with a floor so an empty page set cannot pass. Source-level checking would not have caught this — the source looks correct.
- [x] Check the same pages for `<html lang>`, which has the identical failure mode (WCAG 3.1.1, also Level A) if it was being set through Helmet. **DONE 2026-08-24 — it fails too, on every page, and the guess in this task was wrong in a way that matters.** `lang` was NOT being set through Helmet; no page ever set it by any means. So it is a plain omission rather than another casualty of the missing SSR bridge, which means fixing the bridge would not have fixed it and a reader assuming one fix covers both would have shipped a still-failing page. Recorded as a companion criterion on JTBD-004, whose Confirmation had `<title>` and not this.

## Notes

Not caused by the import and deliberately not fixed by it: ADR-053's premise is that the move changes no rendered output, and wiring Helmet changes every page. Recorded here so the omission is deliberate rather than missed.

## Fixed 2026-08-24

**Mechanism chosen: Gatsby 5's native `Head` export, not the plugin.** The ticket offered both. The plugin
looked like the smaller diff and is the wrong answer twice over — it is deprecated, and it adds a dependency
to prop up a library that was doing nothing on the server. The Head API is core to the installed Gatsby, so
porting to it **removed** `react-helmet` rather than adding anything.

Six pages, not five: `404.tsx` had no `<Helmet>` at all, so unlike the others it was never even trying. That
is the page where the missing title cost most, because ADR-053 deliberately routes traffic to it.

**`<html lang>` needed a second mechanism, and that is a property of the framework rather than a choice.**
Gatsby's Head API emits children of `<head>` and cannot set attributes on `<html>`. So `apps/website/gatsby-ssr.js`
sets `lang="en-AU"` via `onRenderBody({ setHtmlAttributes })` — one place, all six pages including 404, rather
than six chances to miss one. It works only because there is no custom `src/html.js`; Gatsby's default HTML
component spreads `htmlAttributes`, and one that forgot to would make this a silent no-op, which is this
ticket's own failure mode.

`en-AU` rather than `en` is an editorial choice and deliberately **not** asserted as a conformance
requirement — 3.1.1 reads only the primary subtag, so both pass identically. The justification is the content
(Australian orthography, and the demo reads G-NAF toponyms aloud, which en-US and en-GB voices mispronounce),
not the audience or the subject matter, neither of which is what BCP 47 encodes.

### Titles

| Route                | Title                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------- |
| `/`                  | Free Australian Address Validation, Search and Autocomplete - Addressr by Mountain Pass |
| `/pricing/`          | Pricing - Addressr by Mountain Pass                                                     |
| `/quick-start/`      | Quick Start - Addressr by Mountain Pass                                                 |
| `/download/`         | Download - Addressr by Mountain Pass                                                    |
| `/api-docs/`         | API Docs - Addressr by Mountain Pass                                                    |
| 404 (both emissions) | Page not found - Addressr by Mountain Pass                                              |

Only the home page's wording changed, and a voice review **reversed half of what was proposed**. The proposal
was to reorder the title AND drop "by Mountain Pass"; the review pointed out those are independent, and only
the reorder buys anything — the 17 characters saved sit past the tab truncation point, while the other four
pages carry the suffix, so dropping it trades a real consistency gain for nothing visible. It also noted the
shorter form could not be justified on search-result width, because this ticket explicitly declines to claim
search discovery as a reason for any of the work.

### Verification

666 unit tests and 18 website tests pass. A clean rebuild emits a title and `lang="en-AU"` on all six pages
and both 404 files. Three mutations proved the assertions red and restore green: strip a title, duplicate a
title across two pages, strip `lang`.

**The dependency removal was verified the hard way.** `npx npm@10 install --package-lock-only` reconciles the
lock but does not touch `node_modules`, so a green build proves nothing about whether a live import survives.
`react-helmet` was physically moved out of `node_modules` and the site rebuilt: build exits 0, titles still
emit. The lock diff is exactly the manifest line plus `react-helmet`, `react-side-effect` and
`react-fast-compare` — an architect review predicted the last would survive as shared, but it appeared once
in the old lock, as react-helmet's own dependency, so its removal is correct.

### The assertions, and why there are four

- **Non-empty title** on every emitted page. The headline check.
- **DISTINCT titles**, keyed by ROUTE rather than filename. 2.4.2 asks a title to describe topic or purpose,
  so six identical titles would satisfy presence and fail the criterion. Route-keying matters because Gatsby
  emits the 404 twice and those are one page — a filename-keyed check would fail a correct site.
- **`lang` on `<html>`** for every page.
- **Exactly one file per Gatsby lifecycle basename.** Not a content grep — a filesystem cardinality check.
  It exists because this tree has produced the decoy class twice: this ticket's root cause was a
  `gatsby-config.js` that never loaded, and P122 is three redirect mechanisms that never reached the build.
  The title assertions prove the LOADED config is right; they are blind to a second file beside it.

Gatsby's internal slice fragments under `_gatsby/` are excluded — they are HTML by extension and not
documents by nature.

### Found while fixing, NOT fixed here

Recorded so they are not lost, and deliberately not folded in — the first is more severe than this ticket:

- **The site menu is keyboard-inoperable on every page.** `Header.js` and `Menu.js` render the open and close
  controls as anchors with no `href`, so neither is focusable and neither exposes a role. WCAG 2.1.1, Level A.
  Both files open with a hand-written `eslint-disable jsx-a11y/anchor-is-valid` that suppresses nothing,
  because the rule is not installed and the tree is in `globalIgnores`.
- **No skip link anywhere**, with repeated header and nav on all six pages (2.4.1, Level A).
- **All six accent tokens fail 4.5:1 with white text** where `_tiles.scss` uses them as tile backgrounds —
  1.82:1 to 3.43:1, WCAG 1.4.3 Level AA. Black passes on all six. `index.jsx` carries the evidence: three
  hand-patched `color: 'black'` elements, someone fixing this one word at a time.
- Two links with no accessible name in `index.jsx`; `api-docs.js` server-renders no heading and no content.
- The 404 body copy is the verbatim Gatsby starter default and uses "does not exist", which the voice guide
  names as dispreferred. A voice finding, not a conformance one.

The focus ring was checked and is **fine**: `#9bf1ff` on `#242943` is 11.15:1, well past the 3:1 that 1.4.11
needs. It had been flagged UNVERIFIED; it is now measured.
