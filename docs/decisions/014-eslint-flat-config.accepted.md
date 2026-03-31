---
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

**Option 1: ESLint 9 flat config.** 12 configuration layers in `eslint.config.js` with Babel parser (needed because the project doesn't use native ESM). Lint-staged runs `eslint --fix` on every commit.

Plugins: `@eslint/js`, `eslint-plugin-security`, `eslint-plugin-unicorn`, `eslint-plugin-promise`, `eslint-plugin-n`, `eslint-plugin-import-x`, `eslint-plugin-prettier`, `eslint-plugin-chai-friendly`.

### Consequences

- Good: Security plugin catches common vulnerability patterns
- Good: Prettier integration ensures consistent formatting
- Good: Modern flat config is future-proof
- Bad: Babel parser needed because project doesn't use native ESM (see ADR 005)

### Confirmation

- `eslint.config.js` exists with flat config format
- Lint-staged runs `eslint --fix` on `*.js` and `*.jsx`

### Reassessment Criteria

- Migration to native ESM (could drop Babel parser)
- Biome reaching feature parity with the current plugin set
