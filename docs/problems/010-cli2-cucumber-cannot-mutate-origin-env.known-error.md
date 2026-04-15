# Problem 010: CLI2 cucumber profile cannot mutate the origin's environment

**Status**: Known Error
**Reported**: 2026-04-15
**Priority**: 4 (Low) — Impact: Minor (2) x Likelihood: Possible (2)

## Description

The `cli2` test profile runs the Addressr origin as a separately-spawned preinstalled binary (`start:server2:preinstalled` via `run-p` in parallel with `dotest:cli2:nogeo`). Cucumber step definitions live in the test-runner process, so `process.env` mutations in steps do not affect the origin's environment.

As a result, any scenario whose assertions depend on toggling an env var at runtime cannot pass in cli2, even though the underlying code path is exercised correctly in the `rest2` (in-process) profile.

Discovered while landing P009 / ADR 024 proxy-auth enforcement. Five of the six scenarios in `test/resources/features/proxy-auth-enforcement.feature` need mid-run env mutation and are currently tagged `@not-cli2` to unblock the v2.1.4 release. The rest2 profile covers them in-process.

## Symptoms

- `test:cli2:nogeo` fails on any scenario whose step sets `process.env.FOO` before hitting the origin — the origin's `process.env.FOO` is still the value it was booted with.
- The P009 v2.1.4 release pipeline failed initially because `proxy-auth-enforcement.feature` exercised this anti-pattern.
- Current workaround: `@not-cli2` tag excludes affected scenarios from the cli2 profile.

## Workaround

Tag any env-mutating scenario with `@not-cli2`. The `rest2` (in-process) profile retains full coverage, so this is a profile-specific coverage gap, not a test coverage gap at the code-path level.

## Impact Assessment

- **Who is affected**: Developers adding cucumber scenarios for any env-var-driven behaviour (CORS config, proxy auth, PAGE_SIZE, etc.). Risk is future scenarios silently lose cli2 coverage if someone forgets the `@not-cli2` tag and doesn't notice the profile divergence.
- **Frequency**: Rare — most scenarios don't toggle env vars mid-run.
- **Severity**: Minor. Rest2 coverage means code paths are still exercised; this is a profile-specific harness limitation, not a real regression vector.
- **Analytics**: N/A — test-harness concern only.

## Root Cause (Confirmed)

`run-p --race start:server2:preinstalled dotest:cli2:nogeo` launches two child processes from the same shell env. Node does not share mutable env state across processes — the preinstalled binary's `process.env` is frozen at spawn, and cucumber step definitions run inside the test-runner process, not the origin. No test framework can reach into another process's env without either spawning per-scenario or exposing an admin reconfiguration endpoint that widens the production attack surface. This is an inherent cli2-profile harness limitation, not a regression to fix.

## Fix Strategy (Chosen)

Combination of **accept + guardrail**:

1. **Accept the limitation.** `@not-cli2` remains the documented pattern for scenarios that require mid-run env mutation. `rest2` (in-process) retains full coverage of those code paths, so this is a profile-specific harness gap, not a code-coverage gap.
2. **Guardrail against silent erosion.** Pre-commit linter at `scripts/check-not-cli2-tags.mjs` fails commit if any `@not-cli2` tag appears in a cucumber feature without a `docs/problems/NNN-` cross-reference in the file. Tags combined with `@not-cli` are exempt (those are broader profile-specific skips like CORS tests, not the P010 env-mutation class).

Rejected options:

- **Per-scenario server spawn** — 2–5s per scenario overhead and complicates the `run-p --race` topology for a test-harness concern only.
- **Test-only config file hot-reload** — would add production code surface for a test convenience; rejected unless there is independent product value.

### Investigation Tasks

- [x] Confirm root cause (separate-process env frozen at spawn).
- [x] Document workaround (`@not-cli2` tag + rest2 coverage).
- [x] Implement guardrail — `scripts/check-not-cli2-tags.mjs` + regression test at `test/precommit/not-cli2-tags.test.mjs`, wired into `npm run pre-commit`.
- [x] Cross-reference P010 from `test/resources/features/proxy-auth-enforcement.feature` (already present in feature description).
- [ ] Retrospective note in `docs/BRIEFING.md` once this lands.

## Related

- [Problem 009](009-upstream-backends-openly-callable-bypassing-rapidapi.closed.md) — discovery context; proxy-auth scenarios triggered the detection.
- [ADR 024](../decisions/024-origin-gateway-auth-header-enforcement.accepted.md) — motivated the scenarios that exposed this harness gap.
- `test/resources/features/proxy-auth-enforcement.feature` — current `@not-cli2` usage site.
- `package.json` `test:cli2:nogeo` — the profile definition.
- `scripts/check-not-cli2-tags.mjs` + `test/precommit/not-cli2-tags.test.mjs` — the guardrail.
- [JTBD J7](../JOBS_TO_BE_DONE.md#j7-ship-releases-reliably-from-trunk) — the job this guardrail serves.
