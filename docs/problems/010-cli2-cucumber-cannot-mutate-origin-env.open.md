# Problem 010: CLI2 cucumber profile cannot mutate the origin's environment

**Status**: Open
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

## Root Cause Analysis

### Preliminary Hypothesis

`run-p --race start:server2:preinstalled dotest:cli2:nogeo` launches two child processes from the same shell env. Node does not share mutable env state across processes. The preinstalled binary's `process.env` is frozen at spawn. No test framework can reach into another process's env without spawning it per-scenario or exposing an admin reconfiguration endpoint.

### Fix Strategy (to be confirmed)

Potential options (not yet decided — will need ADR if non-trivial):

1. **Accept the current state** — keep `@not-cli2` as the documented pattern, rely on rest2 for env-mutation coverage. Zero new code.
2. **Per-scenario server spawn** — before each env-sensitive scenario, stop the server, re-export env vars, restart with waitport. Adds 2–5s per scenario and complicates the `run-p --race` topology.
3. **Test-only config file hot-reload** — have the origin watch a test-only config file and re-validate proxy auth at each request. Adds production code surface for a test concern; rejected unless there is independent product value.
4. **CI-level linter** — fail CI if the count of `@not-cli2` tags in cucumber features grows without a linked open problem ticket. Low-cost guardrail that makes the current workaround auditable.

Leaning toward a combination of (1) + (4) — accept the limitation, ensure it can't silently expand.

### Investigation Tasks

- [ ] Confirm with a short experiment whether `fs.watch` on a config file is viable without touching production code (e.g. via a dev-only wrapper).
- [ ] Evaluate the cost of per-scenario server spawn in wall-clock terms; decide if acceptable.
- [ ] If accepting (1): implement (4) — a lint step that greps features for `@not-cli2` and cross-references open problems.
- [ ] Document the chosen pattern in `docs/adrs/` or in the cucumber feature file template.

## Related

- [Problem 009](009-upstream-backends-openly-callable-bypassing-rapidapi.closed.md) — discovery context; proxy-auth scenarios triggered the detection.
- [ADR 024](../decisions/024-origin-gateway-auth-header-enforcement.accepted.md) — motivated the scenarios that exposed this harness gap.
- `test/resources/features/proxy-auth-enforcement.feature` — current `@not-cli2` usage site.
- `package.json` `test:cli2:nogeo` — the profile definition.
