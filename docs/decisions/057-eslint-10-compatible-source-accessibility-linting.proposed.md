---
status: 'proposed'
date: 2026-08-26
human-oversight: confirmed
oversight-date: 2026-08-26
decision-makers: [Tom Howard]
consulted: []
informed: []
reassessment-date: 2026-11-26
---

# ESLint 10-compatible source accessibility linting

## Context and Problem Statement

ADR-054 confirms source accessibility linting for the website, but its named `eslint-plugin-jsx-a11y` dependency does not support the repository's ESLint 10 version. Implementing the confirmed outcome therefore requires choosing between a compatible implementation, downgrading ESLint, or forcing an unsupported peer dependency.

## Decision Drivers

- Implement ADR-054 without weakening the repository's current lint stack.
- Use a dependency combination whose declared peer ranges include ESLint 10.
- Prove that JSX and TSX are linted and that Gatsby overlay links cannot be empty.
- Preserve Gatsby client-side routing for internal links.

## Considered Options

1. **Use the ESLint 10-compatible plugin** — use `eslint-plugin-jsx-a11y-x` with `@typescript-eslint/parser`.
2. **Downgrade ESLint** — return the repository to ESLint 9 and use `eslint-plugin-jsx-a11y`.
3. **Force the unsupported peer set** — install `eslint-plugin-jsx-a11y` despite its declared ESLint range.
4. **Defer source linting** — leave ADR-054 unimplemented.

## Decision Outcome

Chosen option: **“Use the ESLint 10-compatible plugin”**, because it implements the already confirmed source-lint outcome while retaining ESLint 10 and respecting declared peer compatibility.

Website source uses the recommended `jsx-a11y-x` rules with `@typescript-eslint/parser`. Generated Gatsby output remains ignored. The Gatsby `Link` component is explicitly included in `anchor-has-content` so internal overlay links retain client-side routing without escaping the rule.

## Consequences

### Good

- JSX and TSX gain author-time accessibility checks on the current ESLint stack.
- Empty Gatsby overlay links fail the same content rule as native anchors.
- Unsupported peer overrides and an unrelated ESLint downgrade are avoided.

### Neutral

- The flat config grows from 16 to 19 top-level entries to keep website source, Gatsby integration files and website tests locally scoped.
- Existing non-accessibility findings remain a measured warning baseline rather than expanding this slice into lint-debt cleanup.

### Bad

- The implementation depends on a compatibility fork rather than the upstream plugin named by ADR-054.
- The parser and plugin add two development dependencies.
- Gatsby components need explicit rule configuration where native-element inference is insufficient.

## Confirmation

1. `npm ls` resolves ESLint 10, TypeScript, `@typescript-eslint/parser` and `eslint-plugin-jsx-a11y-x` without peer errors.
2. Resolving `eslint.config.js` returns 19 top-level entries; generated `public/` and `.cache/` output remains ignored while website source and tests are reached.
3. Linting a TSX mutation succeeds without parse or unmatched-config errors.
4. Linting a self-closing Gatsby `Link` mutation fails `jsx-a11y-x/anchor-has-content`.
5. Linting a label without an associated input fails `jsx-a11y-x/label-has-associated-control`.
6. Full website lint exits zero with 48 measured warnings and no errors, and website typecheck, Gatsby build, built-output tests and browser journeys pass.

## Pros and Cons of the Options

### Use the ESLint 10-compatible plugin

- Good: implements the confirmed outcome on supported peer ranges.
- Bad: uses a compatibility fork.

### Downgrade ESLint

- Good: uses the upstream accessibility plugin.
- Bad: reverses the repository-wide ESLint 10 upgrade for one app.

### Force the unsupported peer set

- Good: avoids an ESLint downgrade and uses the upstream plugin.
- Bad: makes dependency installation rely on an unsupported combination.

### Defer source linting

- Good: adds no dependencies or configuration.
- Bad: leaves ADR-054 and the remaining P138 source-enforcement work incomplete.

## Reassessment Criteria

- `eslint-plugin-jsx-a11y` declares ESLint 10 support.
- `eslint-plugin-jsx-a11y-x` becomes unmaintained or diverges materially from upstream rules.
- Gatsby link semantics or the website framework changes.

## Related

- [ADR-014](014-eslint-flat-config.accepted.md) — the existing flat-config baseline.
- [ADR-054](054-source-accessibility-linting.proposed.md) — the confirmed source-lint outcome this decision implements compatibly.
- [ADR-055](055-built-output-css-selector-reachability.proposed.md) — built-output CSS ownership.
- [ADR-056](056-browser-automated-keyboard-accessibility-verification.proposed.md) — browser-behaviour ownership.
- [P138](../problems/verifying/138-nothing-decides-what-enforces-accessibility-conformance-on-apps-website.md) — the enforcement gap closed by this implementation.
