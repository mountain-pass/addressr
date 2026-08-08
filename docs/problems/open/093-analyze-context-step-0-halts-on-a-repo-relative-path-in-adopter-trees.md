# Problem 093: `analyze-context` Step 0 halts on a repo-relative path, in adopter trees, against its own ADR-049 rule

**Status**: Open — upstream (@windyroad/wr-retrospective)
**Reported**: 2026-08-08
**Priority**: 6 (Medium) — Impact: Minor (2) × Likelihood: Almost certain (3). Impact 2 per RISK-POLICY § Impact: developer/agent time only, and the skill's remaining steps work, so the halt is spurious rather than protective. Likelihood 3: deterministic in any adopter tree, which is every consumer of the plugin outside its own source repo.
**Origin**: internal — hit 2026-08-08 when run-retro Step 2c auto-fired the deep layer on a delta breach.
**Effort**: S — delete the check, or re-express it against the `$PATH` shim the skill already mandates everywhere else.
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

`/wr-retrospective:analyze-context` Step 0 is a halt gate:

```bash
test -x packages/retrospective/scripts/measure-context-budget.sh
```

with the directive _"halt with … Verify the wr-retrospective plugin is installed and up to date"_.

`packages/` does not exist in an adopter tree. The plugin is installed from the marketplace cache, so the path can never resolve, and the gate halts a skill whose remaining steps work perfectly.

**The same skill forbids this exact shape, twice, in the steps immediately after.** Step 1: _"ADR-049 — never invoke the canonical script via repo-relative path; the path does not resolve in adopter trees."_ Step 2 repeats it verbatim, and adds: _"P153 / ADR-049 — do NOT re-introduce repo-relative `packages/*/hooks` … glob loops in SKILL.md prose."_ Step 2 also names a grep-as-lint at `packages/shared/test/no-repo-relative-script-paths-in-skills.bats` that fails CI on regression.

So the rule is documented, enforced by a lint, and violated by the gate that runs before either.

## Symptoms

In an adopter repo, Step 0's `test -x` returns non-zero and the skill's contract says to halt. The remaining steps would have succeeded: `wr-retrospective-measure-context-budget`, `wr-retrospective-list-plugin-attribution` and `wr-retrospective-check-autocreate-rfc-scope` all resolve on `$PATH` and were exercised successfully in the same session.

Observed 2026-08-08 in `mountain-pass/addressr` on `wr-retrospective` 0.27.0. Proceeding past the halt produced a complete report at `docs/retros/2026-08-08-context-analysis.md` with per-plugin decomposition resolved through the helper's documented cache-fallback mode, which is the mode that exists precisely because adopter trees have no `packages/`.

Not caught by the lint because the lint greps for repo-relative paths in _invocation_ position; this one is in a `test -x` guard.

## Workaround

Ignore Step 0 and proceed. Every subsequent step uses the `$PATH` shims and works.

## Impact Assessment

- **Who is affected**: any adopter running `/wr-retrospective:analyze-context`, including via run-retro Step 2c's auto-fire. Maintainer-side; no consumer surface.
- **Frequency**: deterministic in adopter trees. Never fires in the plugin's own source repo, which is why it survives.
- **Severity**: Minor — an agent that honours the halt loses the deep-layer report and the snapshot trailer that the next retro's delta comparison reads, so the cadence trigger degrades silently.
- **Analytics**: not instrumented.

## Root Cause Analysis

Step 0 predates or was written without ADR-049's shim discipline, and the discipline was applied to the invocation sites in Steps 1 and 2 without sweeping the guard above them. The lint that would have caught it checks invocation position only.

Note the second-order effect: honouring the halt means no `docs/retros/<date>-context-analysis.md` is written, so the **next** retro's Step 2c finds no prior snapshot, reports `no prior snapshot — first measurement this project`, and cannot evaluate the delta axis of its own auto-fire trigger. One spurious halt disables the cadence mechanism until someone runs the deep layer manually.

### Investigation Tasks

- [ ] Replace the `test -x` guard with a `command -v wr-retrospective-measure-context-budget` check, or delete it — Step 1 fails loudly enough on its own if the shim is absent.
- [ ] Extend `no-repo-relative-script-paths-in-skills.bats` to catch repo-relative paths in `test -x` / `test -f` guard position, not only invocation position.
- [ ] Report upstream per the P077 precedent, with a PR offered.

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: (none)

## Related

- [P056](../parked/056-wr-itil-skill-md-bodies-exceed-runtime-budget.md) — sibling upstream plugin defect surfaced in the same retro.
- ADR-049 (`$PATH` shims for plugin scripts) — the rule this violates, cited twice inside the same SKILL.md.
- `docs/retros/2026-08-08-context-analysis.md` — the report produced by proceeding past the halt.
