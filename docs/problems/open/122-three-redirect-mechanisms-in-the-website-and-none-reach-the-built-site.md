# Problem 122: The website has three redirect mechanisms and none of them reach the built site

**Status**: Open
**Reported**: 2026-08-23
**Priority**: 6 (Medium) — Impact: Minor (2) × Likelihood: Possible (3). Impact 2: two legacy public paths 404 for anyone who follows them, and a whole class of fix is unavailable when it is next needed — but the site's primary navigation is unaffected and the live domain 301s work, because they are configured outside the repo. Likelihood 3: the harm needs someone to follow one of the dead paths; they are legacy entry points, not linked from current navigation.
**Origin**: internal
**Effort**: S — install the emitting plugin, or move `_redirects` into `static/`, then verify against build output.
**WSJF**: 6.0 — (6 × 1.0) / 1
**JTBD**: JTBD-001
**Persona**: web-app-developer

## Description

Discovered on 2026-08-23 while surveying the site for the `apps/website` import
([ADR-053](../../decisions/053-website-imported-as-an-app-with-hosting-unchanged.proposed.md)). Three
separate redirect mechanisms exist in the website source. **A build emits none of them.**

1. **`gatsby-node.js` `createRedirect`, three calls** — `/signup` → `/quick-start/`, and two
   `/community-support` variants → the Gitter room. All three set `redirectInBrowser: true`.
2. **A root `_redirects` file**, eleven rules, including the `addressr.mountain-pass.com.au` →
   `addressr.io` 301s and `/api-docs` → the RapidAPI listing.
3. **Netlify's own UI configuration**, which is not in the repo at all.

Only the third works. Gatsby collects `createRedirect` data into internal state, and **without
`gatsby-plugin-netlify` — which is not in `package.json` — nothing writes it out**. The root `_redirects`
file is not in `static/`, so Gatsby never copies it to `public/`. The live domain 301s behave correctly,
which means they are configured in the Netlify dashboard and the two in-repo mechanisms are decoration.

## Evidence

From a clean `gatsby build` in a scratchpad workspace on 2026-08-23:

- No `public/signup/` directory.
- No `public/redirects.json`.
- No `public/_redirects`.
- `grep -n "netlify" package.json` returns nothing.

The build log does print `success write out redirect data`, which is the trap: Gatsby reports success for
writing redirect data to its internal store, and a reader scanning the log sees a redirect step succeed.

## Why it matters beyond the two dead paths

ADR-053 deletes `/enterprise-price-request/` and `/callback/`, both live since 2019. The obvious softening
— redirect them — was unavailable, and the user accepted the 404s on that basis. That acceptance is
explicitly conditional: ADR-053 carries a reassessment criterion saying that if this ticket is fixed before
the Cloudflare Pages cutover, the 404 decision should be revisited rather than inherited.

This is also a case of a check that cannot fail. Three mechanisms, no test, no observable difference between
working and broken until someone follows a link.

## Investigation Tasks

- [ ] Confirm what the Netlify UI actually has configured, and reconcile it against the eleven rules in the
      root `_redirects`. They may already disagree; nobody would know.
- [ ] Decide the mechanism. Installing `gatsby-plugin-netlify` emits both `createRedirect` output and
      `static/_redirects` content, but emitted rules may conflict with UI-configured ones — check
      precedence before shipping, because a wrong answer changes live redirect behaviour.
- [ ] Sequence against the Pages cutover. Netlify `_redirects` and Cloudflare Pages `_redirects` have
      similar but not identical semantics; fixing this twice would be waste, and fixing it in the
      Netlify dialect immediately before moving to Pages is close to pointless.
- [ ] Add a test asserting the built output contains the redirect rules, so the next silent breakage is
      loud. Mutation-test it by removing a rule.
