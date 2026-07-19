# Problem 049: wr-retrospective retro scripts lack bin shims in adopter repos

**Status**: Parked
**Reported**: 2026-07-15
**Transitioned to Known Error**: 2026-07-19 (root cause confirmed with cache + upstream-HEAD evidence; workaround verified in-session)
**Parked**: 2026-07-19 (upstream-blocked — fix belongs in `@windyroad/wr-retrospective`; local scope already complete)
**Priority**: 4 (Low) — Impact: Low (2) x Likelihood: Unlikely (2) — derived at capture from the description per Step 4a; cf. P041/P048 (same upstream wr-plugin-friction class, both rated 4)
**Origin**: internal
**Effort**: S — derived at capture per Step 4a (local scope: report upstream + document workaround; upstream fix is three ADR-049 shims + SKILL reword)
**JTBD**: (unconfirmed — elicitation queued)
**Persona**: addressr-maintainer

## Description

wr-retrospective run-retro references check-ask-hygiene.sh / check-briefing-budgets.sh / check-tickets-deferred-cause.sh via repo-relative `packages/retrospective/scripts/` paths and ships no bin/ shims for them, so adopter repos cannot run those retro passes as written. Observed 2026-07-15 in addressr AFK iter (P001): `wr-retrospective-check-ask-hygiene` → command not found; plugin cache 0.27.0 bin/ contains shims for 9 other scripts but not these three; SKILL.md Step 2d.8 and Step 3 budget pass name the scripts repo-relatively (P317/RFC-009 class — NEVER repo-relative from a SKILL). Upstream fix: add ADR-049 $PATH shims + reword SKILL.md to shim names.

## Symptoms

- `wr-retrospective-check-ask-hygiene` → command not found during run-retro Step 2d.8 (R6 gate) in adopter repos
- run-retro Step 3 Tier-3 budget pass and check-tickets-deferred-cause advisory cannot fire as written outside the source monorepo

## Workaround

Invoke the cached script directly: `bash ~/.claude/plugins/cache/windyroad/wr-retrospective/<ver>/scripts/check-ask-hygiene.sh docs/retros` (same for the other two scripts).

## Impact Assessment

- **Who is affected**: addressr-maintainer (and any wr-retrospective adopter) running retro passes outside the windyroad source monorepo
- **Frequency**: every run-retro invocation that reaches Step 2d.8 / Step 3 budget pass / tickets-deferred check
- **Severity**: Low — advisory passes degrade fail-open; retro continues; workaround is trivial
- **Analytics**: N/A

## Root Cause Analysis

**Confirmed 2026-07-19.** The wr-retrospective plugin ships three retro-pass scripts without ADR-049 `$PATH` bin shims, while its own SKILL.md invokes them — so the invocations only resolve inside the windyroad source monorepo, never in adopter repos.

Evidence (all gathered in-session 2026-07-19):

- **Cache 0.27.0 `bin/` listing**: 9 `wr-retrospective-*` shims present (`check-autocreate-rfc-scope`, `check-internal-id-leaks`, `check-plugin-maturity-drift`, `check-readme-jtbd-currency`, `check-skill-md-budgets`, `check-tarball-shipped-shims`, `list-plugin-attribution`, `measure-context-budget`, `migrate-briefing`) — but none for `check-ask-hygiene.sh`, `check-briefing-budgets.sh`, `check-tickets-deferred-cause.sh`, all three of which exist in `scripts/`.
- **SKILL.md repo-relative references**: `run-retro/SKILL.md` (0.27.0) names the three scripts as `packages/retrospective/scripts/...` at lines 295, 301 (check-ask-hygiene), 359 (check-briefing-budgets), 500, 604 (check-tickets-deferred-cause), 632 — the P317/RFC-009 class the plugin's own ADR-049 forbids ("never invoke the canonical script via repo-relative path; the path does not resolve in adopter trees", quoted verbatim at its own line 222).
- **Reproduction** (adopter repo, this session): `command -v wr-retrospective-check-ask-hygiene wr-retrospective-check-briefing-budgets wr-retrospective-check-tickets-deferred-cause` → exit 1, all three not found.
- **Workaround verification** (this session): `bash ~/.claude/plugins/cache/windyroad/wr-retrospective/0.27.0/scripts/check-ask-hygiene.sh docs/retros` → exit 0, correct RETRO/TREND output.
- **Not yet fixed upstream**: `windyroad/agent-plugins` HEAD `packages/retrospective/bin/` (queried via `gh api` 2026-07-19) still lists the same 9 shims — the three are absent at HEAD; issue #362 is OPEN with 0 comments.

Reproduction test: the `command -v` probe above is the repro; no committed addressr test — the defect lives entirely in the upstream plugin (same treatment as P048/P052 in this class).

### Investigation Tasks

- [x] Investigate root cause (confirmed 2026-07-19 — missing bin shims + repo-relative SKILL refs, evidence above)
- [x] Create reproduction test (`command -v` probe, exit 1 in-session 2026-07-19; committed test not applicable — upstream-external defect)

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: (none)

## Related

(captured via /wr-itil:capture-problem; expand at next investigation)

- Upstream candidate: windyroad plugin suite (wr-retrospective 0.27.0) — report via /wr-itil:report-upstream when ready
- P317/RFC-009 class (upstream): repo-relative script references from SKILL.md
- Hang-off pre-filter: 0 candidates shared signals (packages/retrospective, check-ask-hygiene, check-briefing-budgets) across open/ + verifying/ — PROCEED_NEW without subagent dispatch (empty-candidates short-circuit)
- **Reported upstream**: https://github.com/windyroad/agent-plugins/issues/362 (2026-07-18) — repro-confirmed in 0.27.0

## Reported Upstream

- **URL**: https://github.com/windyroad/agent-plugins/issues/362
- **Reported**: 2026-07-18
- **Template used**: problem-report.yml (problem-shaped structured body)
- **Disclosure path**: public issue
- **Cross-reference confirmed**: yes (issue body records the P049 downstream reference)

## Parked

- **Reason**: upstream-blocked — the fix (three ADR-049 `$PATH` shims in `packages/retrospective/bin/` + rewording `run-retro/SKILL.md` to shim names) lives entirely in `@windyroad/wr-retrospective`, not in this repo. Verified 2026-07-19: upstream HEAD `bin/` still lacks the three shims and [windyroad/agent-plugins#362](https://github.com/windyroad/agent-plugins/issues/362) is open with no response (0 comments). The ticket's local scope (report upstream + document workaround) is complete — nothing in addressr can add the shims.
- **Un-park trigger**: windyroad/agent-plugins#362 closes, or a `@windyroad/wr-retrospective` release (> 0.27.0) ships the three shims — then verify `wr-retrospective-check-ask-hygiene` resolves on `$PATH` in this repo, retire the direct-cache-invocation workaround, and close.
- **Date parked**: 2026-07-19
