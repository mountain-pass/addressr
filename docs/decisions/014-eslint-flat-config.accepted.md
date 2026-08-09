---
human-oversight: confirmed
oversight-date: 2026-07-18
status: accepted
date: 2025-01-01
decision-makers: [Tom Howard]
consulted: []
informed: []
---

# ADR 014: ESLint 9 Flat Configuration with Security and Quality Plugins

## Context and Problem Statement

The project needs consistent code quality enforcement with security vulnerability detection, enforced at commit time.

## Decision Drivers

- Security vulnerability detection in code
- Consistent formatting (Prettier integration)
- Modern ESLint flat config (legacy config deprecated)
- Commit-time enforcement via lint-staged

## Considered Options

1. **ESLint 9 flat config** with security, unicorn, promise, node, import-x, prettier plugins
2. **Biome** -- all-in-one linter and formatter
3. **ESLint legacy config** -- `.eslintrc.json` format

## Decision Outcome

**Option 1: ESLint 9 flat config.** 16 top-level entries in `eslint.config.js`. Lint-staged runs `eslint --fix` on every commit. **Amended 2026-08-09**: this sentence carried two expired claims — a layer count of twelve, and a Babel parser justified by the project not using native ESM. The count is 16 entries, verified by resolving the exported array rather than counting by eye, and stated as entries rather than layers because several entries are presets that flatten to more than one config object — entries are what an assertion can be written against. The Babel parser was removed on 2026-08-08 under ADR 044 (Native ESM without a build step, superseding ADR 005); `eslint.config.js` runs the default parser and records the removal at the site. The superseded wording is described rather than quoted, deliberately: quoting it verbatim would leave the false string greppable, which is the failure the 2026-08-09 sweep was closing.

Plugins: `@eslint/js`, `eslint-plugin-security`, `@eslint-community/eslint-plugin-eslint-comments`, `eslint-plugin-unicorn`, `eslint-plugin-promise`, `eslint-plugin-n`, `eslint-plugin-import-x`, `eslint-plugin-prettier`, `eslint-plugin-chai-friendly`.

### Consequences

- Good: Security plugin catches common vulnerability patterns
- Good: Prettier integration ensures consistent formatting
- Good: Modern flat config is future-proof
- Bad (at decision time; **no longer true as of 2026-08-08**): Babel parser was needed because the project did not use native ESM (ADR 005). ADR 044 retired Babel and the parser went with it — past-tensed rather than deleted because it records why the option was chosen, but left in the present tense it read as a live justification citing a superseded decision.

### Confirmation

- `eslint.config.js` exists with flat config format
- Lint-staged runs `eslint --fix` on `*.js` and `*.jsx`

### Reassessment Criteria

- ~~Migration to native ESM (could drop Babel parser)~~ **DISCHARGED 2026-08-09**: fired and acted on. ADR 044 landed the migration on 2026-08-08 and `eslint.config.js` already runs the default parser.
- Biome reaching feature parity with the current plugin set
