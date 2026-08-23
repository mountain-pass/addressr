# Problem 125: Every page of addressr.io ships without a `<title>` element

**Status**: Open
**Reported**: 2026-08-23
**Priority**: 12 (High) — Impact: Moderate (3) × Likelihood: Certain (4 capped at Likely for scoring consistency with realised defects). Impact 3: WCAG 2.4.2 Page Titled is **Level A**, the lowest bar, and it fails on every page of the public marketing site. A screen-reader user hears the URL or nothing when the tab opens, browser tabs and bookmarks are unlabelled, and search engines have no title to index — which also costs the site the discovery path JTBD-004 depends on. Not 4: no data loss, no service outage, and the pages are otherwise navigable. Likelihood: this is not a probability. It is realised and live on all five pages as of 2026-08-23.
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

**Why it looks configured but is not** — this is the same defect class as [P122](122-three-redirect-mechanisms-in-the-website-and-none-reach-the-built-site.md), in the same tree. Two Gatsby configs ship:

|                                         | `gatsby-config.js` | `gatsby-config.ts` |
| --------------------------------------- | ------------------ | ------------------ |
| Loaded by Gatsby                        | **no**             | **yes**            |
| References `gatsby-plugin-react-helmet` | yes                | no                 |
| Google Analytics / Ads IDs              | yes                | no                 |
| `gatsby-plugin-offline`                 | yes                | no                 |

Confirmed by reading Gatsby's own compiled output at `apps/website/.cache/compiled/gatsby-config.js`, which carries the `.ts` content. So the file a maintainer would open — the obvious filename, the one that mentions Helmet and analytics — has never executed. Neither `gatsby-plugin-react-helmet` nor `gatsby-plugin-offline` is even installed; the build survives only because nothing reads the file that names them.

ADR-053 deletes `gatsby-config.js` for this reason. **Deleting it does not fix this ticket** — it removes the misleading artefact, which is what makes the gap visible instead of apparently-configured.

## Investigation Tasks

- [ ] Decide the mechanism: add `gatsby-plugin-react-helmet` to `package.json` and the `.ts` config, or port the five pages to Gatsby 5's native Head API and drop `react-helmet` entirely. The Head API is the maintained path and removes a dependency; the plugin is the smaller diff.
- [ ] Give each page a distinct, descriptive title. 2.4.2 wants a title that describes topic or purpose, so five identical titles would technically pass and practically fail.
- [ ] Add a build-output assertion that every emitted `index.html` contains a non-empty `<title>`, with a floor so an empty page set cannot pass. Source-level checking would not have caught this — the source looks correct.
- [ ] Check the same pages for `<html lang>`, which has the identical failure mode (WCAG 3.1.1, also Level A) if it was being set through Helmet.

## Notes

Not caused by the import and deliberately not fixed by it: ADR-053's premise is that the move changes no rendered output, and wiring Helmet changes every page. Recorded here so the omission is deliberate rather than missed.
