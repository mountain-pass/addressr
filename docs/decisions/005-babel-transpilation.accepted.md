---
status: accepted
date: 2019-01-01
decision-makers: [Tom Howard]
consulted: []
informed: []
---

# ADR 005: Babel Transpilation for ES Module Support

## Context and Problem Statement

The codebase uses ES module syntax (`import`/`export`) but Node.js historically required CommonJS (`require`). A transpilation step is needed to bridge the gap.

## Decision Drivers

- Developer experience with modern ES module syntax
- Compatibility with Node.js CommonJS module system
- Build step simplicity

## Considered Options

1. **Babel transpilation** -- `@babel/preset-env` targeting current Node.js
2. **Native Node.js ESM** -- `"type": "module"` in package.json
3. **TypeScript** -- full type system with ESM transpilation

## Decision Outcome

**Option 1: Babel.** Source files use `import`/`export`, Babel compiles to CommonJS in `lib/`. Dev scripts use `babel-node` for direct execution. Tests use `@babel/register`.

### Consequences

- Good: Clean ES module syntax in source
- Bad: Build step required before publishing
- Bad: `babel-node` is slower than native for development
- Bad: Technical debt -- Node.js 22 has mature native ESM support, making Babel unnecessary
- Bad: `@babel/polyfill` (used in test setup) is deprecated

### Confirmation

- `.babelrc` exists with `@babel/preset-env`
- `package.json` build script: `babel . ... -d lib`
- No `"type": "module"` in package.json

### Reassessment Criteria

- Node.js 22 is now the minimum version -- native ESM is fully supported
- Desire to eliminate the build step
- TypeScript adoption
