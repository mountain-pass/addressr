# Problem 103: Workflow referrers outside guard coverage rot unseen

**Status**: Open
**Reported**: 2026-08-18
**Priority**: 8 (Medium) — Impact: 2 × Likelihood: 4 — derived at capture from the description per Step 4a
**Origin**: internal
**Effort**: M — derived at capture per Step 4a
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

`.github/workflows/perf-regression.yml` has now broken twice at the same site, and **both times it was found by human review rather than by a test**.

1. **2026-08-12 to 2026-08-17** — `npm run genversion` stopped resolving after the ADR-046 restructure moved the script into the `@mountainpass/addressr` workspace. Six consecutive nightly failures, unread. Found by an unrelated `gh run list`.
2. **2026-08-18** — a `node -e` body carried an explanatory comment that broke the step two ways at once: backticks inside the double-quoted shell string became command substitution, and `#` is not a JavaScript comment so node threw `SyntaxError`. Introduced _while fixing the first defect_. Found by risk scoring.

The `npm run` half is now guarded (`workflow-npm-scripts-resolve.test.mjs`). Two narrow shapes of the `node -e` half are guarded as of the second defect — a `#` line and a backtick inside the body. **The general class is not.**

## Symptoms

1. A `node -e` body can be syntactically invalid ESM and nothing catches it. The current guard checks two specific shapes, not that the body parses.
2. An `await import()` specifier inside such a body can name a path that does not exist. That is exactly defect 1's sibling — the second unrepointed ADR-046 referrer in the same file — and it is listed as NOT COVERED in ADR-048's Confirmation.
3. Bare script paths (`scripts/foo.sh`) and `npx` invocations in workflows are unguarded entirely.
4. All of it is cache-masked and `schedule`-only on this workflow, so failures reach nobody (P101).

## Workaround

Human review, which has caught both instances and is the reason this ticket exists rather than a third outage.

## Impact Assessment

- **Who is affected**: the maintainer relying on nightly perf signal; anyone whose tree move silently invalidates a workflow referrer.
- **Frequency**: twice at one site in seven days, both traceable to one restructure.
- **Severity**: Minor. Confined to CI tooling — gates no push, blocks no release, touches no publish or deploy path. The cost is a guard believed to be watching that is not.
- **Analytics**: 2 defects, 1 file, 0 caught by test.

## Root Cause Analysis

A workflow is YAML containing shell containing, sometimes, JavaScript. Each nesting level has its own comment syntax, its own quoting rules and its own idea of what a path is relative to — and nothing validates the inner levels. The `npm run` guard works because `npm run <script>` is a flat, greppable shape; a `node -e` body is a program, and checking a program needs a parser rather than a regex.

### Investigation Tasks

- [ ] Extract every `node --input-type=module -e "…"` body under `.github/workflows/**` and assert it **parses as ESM** (`node --check` with `--input-type=module`, or `acorn`). Replaces the two shape checks with the real property.
- [ ] Resolve every `await import()` / `import ... from` specifier in those bodies against the filesystem, honouring that `node -e` runs with cwd at the repo root while module-relative imports elsewhere do not.
- [ ] Extend to bare script paths (`scripts/*.sh`, `.husky/*`) and `npx` invocations named in `run:` blocks.
- [ ] Once the general guard lands, **narrow ADR-048's NOT-COVERED list to match** — it currently names `node -e` imports, bare paths and `npx` as uncovered, and that statement must stay true or become false loudly.
- [ ] Consider whether the same nesting problem exists in `release.yml`'s `node -e` blocks, which are the twins of the ones that broke here.

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: P101 (a scheduled workflow's loud failure has no reader) — detection and delivery are separate halves; a guard nobody reads is P101's problem, a defect no guard sees is this one.

## Related

- **ADR-048** (`docs/decisions/048-moved-path-referrers-resolved-by-executable-guard.proposed.md`) — its Confirmation names this exact gap as NOT COVERED, and its reassessment criterion _"a moved-path referrer rots again in a class the guards do not cover — most likely a `node -e` import"_ has now fired.
- **ADR-046** — the restructure both defects trace to.
- **P101** — why neither defect was noticed from the workflow's own output.
- **P032** — the perf-regression probe whose signal both defects invalidated.
- `test/js/__tests__/workflow-npm-scripts-resolve.test.mjs` — the partial guard; its header states the limit this ticket closes.

Captured via `/wr-itil:capture-problem`. Hang-off check: P101 shares the file and the restructure but owns the _audience_ for a failure, not the _detection_ of a defect; this proceeds as a sibling.
