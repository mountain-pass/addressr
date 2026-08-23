# Problem 127: Nothing makes a mis-set Netlify base directory fail loudly, and ADR-053 says something that does

**Status**: Open
**Reported**: 2026-08-23
**Priority**: 9 (Medium) — Impact: Moderate (3) × Likelihood: Possible (3). Impact 3: the failure publishes a site built from a dependency resolution nobody tested, and it publishes it **successfully** — no red build, no alert. Likelihood 3: it needs someone to set Netlify's base directory to `apps/website`, which is the intuitive choice and the one [ADR-053](../../decisions/053-website-imported-as-an-app-with-hosting-unchanged.proposed.md) originally recorded before the architect gate corrected it.
**Origin**: internal
**Effort**: M — a new ADR carrying a clause-level supersession, plus a guard with a proved refusal path and a wiring assertion.
**WSJF**: 4.5 — (9 × 1.0) / 2
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

Surfaced by the pre-commit risk review of the `apps/website` import and confirmed by the architect gate.

ADR-053 sets Netlify's base directory to the repository root, because `apps/website` breaks npm workspaces.
Its Hosting row then justifies deleting the imported tree's nested `package-lock.json` on this ground:

> it is the artefact that would let a mis-set Netlify base directory build **successfully** from a divergent
> resolution rather than failing

**That ground is false, and the deletion does not supply the loudness it claims.** Every dependency in
`apps/website/package.json` is a caret range. With base mis-set and no nested lockfile, Netlify's default
`npm install` resolves floating-latest-within-caret — `gatsby ^5.12.4` becomes 5.16.1, and so on down the
tree — and almost certainly **builds**. The failure mode changed from _silently building against a stale 2023
pinned resolution_ to _silently building against an unpinned current one_. Still silent, still divergent from
what CI tests and what the monorepo lockfile pins.

The deletion remains correct — it removes a divergent-resolution artefact — but the conclusion is right for a
reason the record does not state.

**And the file that looks like it guards this cannot.** Netlify reads `netlify.toml` **from the base
directory**. In the exact mis-set case, the root `netlify.toml` is never read: no ignore rule, no build
command, no publish path. Every line of it inert, including the comment explaining why base must be the root.

## Why this needs an ADR and not an edit

Per ADR-049, a stated fact inside reasoning is a factual correction, but **the inferential step on which an
option was chosen is substance** — the ratifier agreed to the conclusion _on that ground_. This is the ground
for a deletion, and ADR-053 says so in terms. The correction also adds new reasoning (the caret-range
mechanism) and creates a new obligation (a guard). All three are substance.

ADR-053 is ratified, so this routes to a new record with `supersedes-clause: 053#nested-lockfile-makes-mis-set-base-loud`
and a reverse `Superseded in part by` badge on ADR-053's compendium entry, in the shape this repo has run
three times (ADR-047 over ADR-045, ADR-049 over ADR-047, ADR-050 over ADR-040). **ADR-053's conclusion
stands** — base at the repository root is still right. Route right, reason wrong.

Note this would be the **fourth clause-level supersession within a month, from a cause unrelated to amendment
policy**, which is ADR-049's own third reassessment criterion. That reassessment is now due on its own terms
rather than notionally, and the new record should say so.

## Design notes, so the next attempt does not repeat the discarded ones

A first attempt was drafted and not shipped. What was wrong with it, recorded because each is a trap:

- **`prebuild` in the app manifest is not universal.** It fires on `npm run build` for the workspace. It does
  **not** fire for `gatsby build`, `npx gatsby build` or `turbo run build` — and in the mis-set case no
  `netlify.toml` is read, so the command is whatever the Netlify UI holds, which Netlify's own Gatsby
  detection sets to `gatsby build`. `--ignore-scripts` also bypasses it. The guard would have been inert in
  precisely the scenario it defends. Claiming otherwise would have replaced one ungrounded mechanism claim
  with another, in the same commit that corrects the first.
- **Asserting gatsby hoists to the root has a false-positive vector.** `install-strategy=nested` (via a future
  `.npmrc`, `NPM_CONFIG_INSTALL_STRATEGY`, or Netlify's `NPM_FLAGS`) puts gatsby in
  `apps/website/node_modules` on a perfectly correct root install, and the guard would red a good build.
  Nothing in the repo pins the strategy today — there is no `.npmrc` anywhere — but nothing prevents one.

What to use instead:

- **Assert the workspace symlink, not the absence of a local copy.** `node_modules/@mountainpass/addressr`
  is created by any root `npm install`/`npm ci`, regardless of install-strategy and regardless of
  `--omit=dev`, and is **absent** when the install ran inside `apps/website`. Verified present today. That
  keys on the thing actually meant and has no false-positive surface I can construct.
- **A NESTED `apps/website/netlify.toml` fires only in the mis-set case**, which is the neat inversion: with
  base at the root Netlify reads the root file and never the nested one, so it is inert exactly when the
  problem is absent. `netlify.toml` also takes precedence over UI build settings, so two lines are a hard
  refusal — immune to `--ignore-scripts` and to whatever the UI holds.
- **Wire the general guard into `gatsby-node.js`'s `onPreInit`**, which runs for any gatsby build however
  invoked, rather than relying on `prebuild` alone.

## Investigation Tasks

- [ ] Write the ADR carrying the clause-level supersession, and note ADR-049's reassessment trigger.
- [ ] Add the nested `apps/website/netlify.toml` refusal.
- [ ] Add the workspace-symlink guard, invoked from `onPreInit`.
- [ ] **Prove the refusal path**, not just the pass. A guard never observed refusing is a guard whose refusal
      is unexecuted — spawn it against a fabricated resolution root and assert both exit codes.
- [ ] Guard the guard's wiring (ADR-048 class): deleting the hook must red something. Prefer the behavioural
      child-process form so the P033 population stays flat; a manifest grep would be the source-inspection
      class, and putting it in the website tier to dodge the predicate would be the dodge that tier's own
      header disclaims.

## Related

- **R4 from the same review, folded here rather than given its own ticket**: `apps/website/src/pages/pricing.js`
  commits per-request and per-month tier prices, which `RISK-POLICY.md:29` names confidential — though these
  are the product's own public storefront figures, live on the site and the RapidAPI listing, so the policy's
  stated rationale ("this repository is public; committing such data constitutes an information disclosure
  incident") is defeated by the facts. The architect's call: a scoping clarification to RISK-POLICY.md, not an
  ADR, because that file is the ratifiable and enforced home for what "confidential" means. Word it as a
  content class ("figures the product itself publishes on its public storefront"), never as a path exclusion —
  and when R004's pre-commit metric scrub is built, make the carve-out named in its output and tested, the way
  ADR-053 required of the licence audit's exclusion. A blanket `apps/website` exclusion would be the P106
  false-green shape.
