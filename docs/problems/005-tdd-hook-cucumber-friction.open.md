---
id: '005'
title: TDD hook does not recognise Cucumber feature files
status: open
created: 2026-04-14
severity: low
---

# Problem: TDD hook does not recognise Cucumber feature files

## Symptoms

The TDD enforcement hook (`tdd-enforce-edit.sh`) only transitions from IDLE to RED state when a `*.test.*` or `*.spec.*` file is written. Writing a Cucumber `.feature` file — which IS a test — does not trigger the state transition. This forces developers to create a thin `*.test.js` wrapper file just to enter the TDD cycle.

## Impact

- Extra boilerplate file (`test/js/locality-search.test.js`) that exists only to satisfy the hook
- Friction on every new feature that uses Cucumber BDD (the project's primary test framework per ADR 009)
- Confusing workflow: the "real" tests are in `.feature` files but the hook doesn't see them

## Root Cause

The `tdd_classify_file()` function in `tdd-gate.sh` classifies files by extension pattern. It checks for `*.test.*` and `*.spec.*` but not `*.feature`. Cucumber feature files fall through to the "exempt" or "impl" classification.

## Workaround

Create a `*.test.js` file that imports the service functions being tested. This satisfies the hook and transitions to RED state.

## Proposed Fix

Update `tdd_classify_file()` in the TDD plugin to recognise `.feature` files as test files:

```bash
case "$FILE_PATH" in
  *.feature) echo "test"; return ;;
esac
```

This is a change to the windyroad TDD plugin, not to the addressr project itself.
