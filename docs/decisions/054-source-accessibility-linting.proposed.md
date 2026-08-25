---
status: 'proposed'
date: 2026-08-24
human-oversight: confirmed
oversight-date: 2026-08-25
decision-makers: [Tom Howard]
consulted: []
informed: []
supersedes-clause: 053#eslint-ignore-phase-1
reassessment-date: 2026-11-24
---

# Source accessibility linting

## Context and Problem Statement

[ADR-053](053-website-imported-as-an-app-with-hosting-unchanged.proposed.md) temporarily excluded `apps/website` from ESLint. Within three days, invalid footer anchors and unnamed tile links reached production. Source lint could have reported both before a build.

Removing the existing ignore alone would not provide that protection. Measured on 2026-08-24, `npx eslint apps/website` produced 53,405 findings because it included generated output. Restricting the run to source and tests produced 81 findings across 17 files, while every `.js` file containing JSX failed to parse and `.jsx`/`.tsx` files matched no configuration.

This decision assigns author-time accessibility markup checks. It does not decide CSS selector reachability or interactive keyboard behaviour; those are separate decisions in [ADR-055](055-built-output-css-selector-reachability.proposed.md) and [ADR-056](056-browser-automated-keyboard-accessibility-verification.proposed.md).

## Decision Drivers

- Catch invalid accessibility markup before a build or deployment.
- Prove the linter reaches JSX and TSX source rather than producing a false green result.
- Exclude generated output so actionable findings are not buried.
- Keep lint adoption compatible with the existing autofixing pre-commit path.

## Considered Options

1. **Adopt source accessibility linting** — configure parsing, file matching and `jsx-a11y` for website source.
2. **Keep the website excluded from linting** — continue finding markup defects through review and built output.
3. **Use built-output assertions only** — check emitted HTML after a build but provide no author-time feedback.

## Decision Outcome

Chosen option: **“Adopt source accessibility linting”**, because invalid anchors, unnamed links, missing labels and ARIA misuse are cheapest to catch in the source that introduced them.

Source lint owns author-time markup rules. Generated `public/` and `.cache/` output remain excluded. The `.prettierignore` entry for `apps/website` remains because it prevents unrelated reformatting and is independent of ESLint coverage.

## Consequences

### Good

- Markup defects fail close to the edit that introduced them.
- Parser and file-scope confirmation prevents an installed-but-inert plugin from appearing effective.
- Generated bundles cannot drown source findings.

### Neutral

- CSS reachability and keyboard interaction remain owned by their separate decisions.
- `404.tsx` remains outside the current `lint-staged` glob unless a later decision changes that established confirmation criterion.

### Bad

- A JSX/TypeScript parser and `eslint-plugin-jsx-a11y` add dependencies and configuration.
- The existing source findings must be fixed or explicitly baselined before the ignore is narrowed.
- Staged website files enter an autofixing path, so the adoption must start from a measured green or recorded baseline.

## Confirmation

1. `eslint.config.js` ignores `apps/website/public/` and `apps/website/.cache/`, but not website source.
2. `npx eslint apps/website/src` reports no JSX parse errors and does not ignore `.jsx` or `.tsx` for lack of matching configuration.
3. A mutation recreating the formerly unnamed API tile link fails `jsx-a11y/anchor-has-content`.
4. When the broad website ignore is removed, source and test lint is green or every remaining finding is explicitly baselined with its count. The measured starting point is 81 findings across 17 files.

## Pros and Cons of the Options

### Adopt source accessibility linting

- Good: fastest feedback for the observed markup defects.
- Bad: requires parsing, scoping and dependency work before it covers any JSX.

### Keep the website excluded from linting

- Good: no adoption cost.
- Bad: repeats the conditions under which the observed defects shipped.

### Use built-output assertions only

- Good: checks the emitted artefact without new source tooling.
- Bad: feedback arrives later and cannot reliably attribute defects to their source rule.

## Reassessment Criteria

- An assigned markup defect escapes a correctly running lint configuration.
- Accessibility rules are broadly downgraded from errors to warnings.
- The website changes framework or adopts a component library that changes parsing or rule ownership.
- The existing lint architecture is superseded.

## Related

- [ADR-014](014-eslint-flat-config.accepted.md) — the existing flat-config and pre-commit lint architecture.
- [ADR-015](015-dry-aged-deps.accepted.md) — freshness control for the new dependencies.
- [ADR-053](053-website-imported-as-an-app-with-hosting-unchanged.proposed.md) — superseded only for its temporary ESLint source exclusion; its Prettier exclusion stands.
- [ADR-055](055-built-output-css-selector-reachability.proposed.md) — build-time ownership of CSS reachability.
- [ADR-056](056-browser-automated-keyboard-accessibility-verification.proposed.md) — behavioural keyboard ownership.
- [P084](../problems/open/084-eslint-10-and-unicorn-72-leave-a-deliberate-lint-debt-with-no-ci-gate.md) — sequencing authority for entering the autofixing lint path.
- [P138](../problems/verifying/138-nothing-decides-what-enforces-accessibility-conformance-on-apps-website.md) — implementation ticket.
- [P139](../problems/closed/139-the-home-pages-api-tile-is-a-link-with-no-accessible-name.md) — observed unnamed-link defect.
