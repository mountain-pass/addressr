# Problem 062: AFK iter subprocess sessions missing docs/BRIEFING.md content

**Status**: Parked
**Reported**: 2026-07-20
**Priority**: 6 (Medium) — Impact: Minor (2) × Likelihood: Possible (3) — derived at capture from the description per Step 4a (institutional-knowledge invisibility causes rework only when a briefed trap recurs in an AFK iter; the structural absence is every iter, the harm is occasional — two demonstrated recurrences, #368 and #370 filings)
**Origin**: internal
**Effort**: S — derived at capture per Step 4a (one idempotent skill invocation, /wr-retrospective:migrate-briefing, plus a next-iter verification)
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

AFK iter subprocess sessions do not receive docs/BRIEFING.md content — the wr-retrospective SessionStart briefing surface expects the per-topic docs/briefing/ tree, and this repo still carries the legacy single-file docs/BRIEFING.md (migrate-briefing never run). Observed 2026-07-20 (P059 iter): the briefing's 2026-07-19 entry documenting the external-comms gate's --body-file empty-draft trap (written after the same trap cost round-trips filing agent-plugins#368) was absent from the subprocess context, so the P059 iter re-derived the identical workaround from hook source at the cost of 3 gate denies + 2 redundant reviewer dispatches while filing agent-plugins#370. Institutional knowledge in the legacy briefing is silently invisible to every AFK iteration. Fix strategy: run /wr-retrospective:migrate-briefing (idempotent one-shot migration to docs/briefing/), then verify a subsequent AFK iter receives briefing content; workaround until then is to grep docs/BRIEFING.md for the relevant gate/tool surface before external-comms work in AFK iters.

## Symptoms

- No `docs/BRIEFING.md` content is present in any session's injected context, AFK or interactive. Confirmed live 2026-07-24: the AFK work-problems iter that investigated this ticket received CLAUDE.md + MEMORY.md but NOT briefing content in its system context.
- The wr-retrospective SessionStart briefing hook silent-exits every session (no visible "CROSS-SESSION BRIEFING — critical points" block).

## Workaround

Grep docs/BRIEFING.md for the relevant gate/tool surface before external-comms (or other gate-heavy) work in AFK iters.

## Impact Assessment

- **Who is affected**: addressr-maintainer (JTBD-400 — Ship releases reliably from trunk) via every AFK /wr-itil:work-problems iteration
- **Frequency**: structural (every AFK iter lacks the briefing); harm manifests occasionally, when a briefed trap recurs
- **Severity**: Medium — rework cost when it bites (3 gate denies + 2 redundant reviewer dispatches on the 2026-07-20 recurrence)
- **Analytics**: N/A

## Root Cause Analysis

**Confirmed 2026-07-24** (AFK work-problems iter; direct inspection of the installed hook + live reproduction):

- The installed SessionStart briefing hook — `session-start-briefing.sh` in `@windyroad/wr-retrospective` 0.27.0 (P100 slice 2, ADR-040) — reads **only** `${CLAUDE_PROJECT_DIR}/docs/briefing/README.md`, extracts the `## Critical Points (Session-Start Surface)` section, and `exit 0`s silently when that file is absent. It is **not** dual-tolerant: it never reads the legacy `docs/BRIEFING.md`. (The "dual-tolerant hook" language in the migrate-briefing SKILL prose does not match the shipped 0.27.0 hook body.)
- No `UserPromptSubmit` briefing hook (the mechanism ADR-019 documents) is wired in this repo — `grep -rl 'docs/BRIEFING.md'` over the installed hooks + `.claude/` finds no active injector. The ADR-019-recorded injection mechanism is already fully retired at the plugin level; the addressr repo simply never migrated its content into the `docs/briefing/` tree the new surface expects.
- Net effect: `docs/briefing/` does not exist → the hook silent-exits → **no** briefing content reaches **any** session. Scope is broader than the ticket title's "AFK iter subprocess sessions" — the invisibility is universal (every session), not AFK-specific. The AFK harm is the demonstrated recurrence cost (#368/#370); the structural absence hits interactive sessions too.

Reproduction (mechanical, no test file needed): `[ -f docs/briefing/README.md ] || echo "SessionStart briefing hook no-ops"` prints the no-op branch; the legacy `docs/BRIEFING.md` is present but unread. Live corroboration recorded under Symptoms.

### Investigation Tasks

- [x] Investigate root cause — installed hook is single-source (`docs/briefing/README.md` only); tree absent; legacy file unread (evidence above)
- [x] Create reproduction test — mechanical repro documented above; live in-session corroboration under Symptoms
- [ ] Run /wr-retrospective:migrate-briefing and verify a subsequent AFK iter receives briefing content — **blocked** (see Fix Strategy + Parked)

## Fix Strategy

Run `/wr-retrospective:migrate-briefing` (idempotent, foreground-synchronous; the wr-retrospective shim `wr-retrospective-migrate-briefing`). It splits legacy `docs/BRIEFING.md` by H2 into `docs/briefing/<slug>.md`, writes `docs/briefing/README.md` with a `## Critical Points (Session-Start Surface)` placeholder (populated later by `/wr-retrospective:run-retro`), retires the legacy file to `docs/BRIEFING.md.migrated-<date>`, and self-commits per ADR-014. Dry-run 2026-07-24 confirmed the plan: two topic files (`what-you-need-to-know.md`, `what-will-surprise-you.md`) + index + rename. Once `docs/briefing/README.md` exists with a non-empty Critical Points section, the SessionStart hook surfaces it. The I13 fix-time RFC-trace gate (`wr-itil-check-fix-rfc-trace`) returns `no-rfc-trace: P062` — a fix-time RFC must be auto-created via `/wr-itil:capture-rfc --fix-time` before the migration lands.

**Blocked (architect ISSUES FOUND, 2026-07-24):** the migration diverges from **ADR-019** (Session Learning and Briefing System, `human-oversight: confirmed` 2026-07-18), whose Decision Outcome records the single-file `docs/BRIEFING.md` + `UserPromptSubmit` design. Landing the migration while ADR-019 still describes the retired design is decision-record drift. Reconciling ADR-019 to the shipped SessionStart / per-topic-tree mechanism (in-place evolution vs supersession) + re-ratifying the changed confirmed decision + regenerating the ADR compendium (ADR-077) is a user governance call, routed via `/wr-architect:review-decisions`. Deferred out of this AFK iter (no autonomous mutation of confirmed governance). JTBD/style-guide/voice-tone gates PASS.

_JTBD advisory (non-blocking):_ JTBD-400 trace is thematically sound but imprecise — the demonstrated harm is per-session institutional-context loss, not a release-pipeline defect; a future JTBD refinement could add an addressr-maintainer job "each working session has the institutional context it needs."

## Dependencies

- **Blocks**: (none)
- **Blocked by**: ADR-019 reconciliation (record-sync of the confirmed briefing-system ADR to the shipped SessionStart / per-topic-tree mechanism + re-ratification). Not a problem ticket, so it does not propagate transitive effort per P076; it is a user-governance gate, tracked in the Parked section below.
- **Composes with**: (none)

## Parked

- **Reason**: Blocked pending a user governance decision. The fix (`/wr-retrospective:migrate-briefing`) cannot land without first reconciling confirmed ADR-019 to the shipped SessionStart / per-topic-`docs/briefing/`-tree design (architect ISSUES FOUND, 2026-07-24). The reconciliation approach (in-place evolution vs supersession) and re-ratification of the changed confirmed decision are the user's call — not autonomously actionable in an AFK iter. Root cause is confirmed and the workaround is documented, so investigation is complete; only the fix is suspended.
- **Un-park trigger**: User ratifies the ADR-019 reconciliation (e.g. via `/wr-architect:review-decisions`), after which the fix path is: `/wr-itil:capture-rfc --fix-time P062` → `/wr-retrospective:migrate-briefing` → transition P062 to Verification Pending. On un-park, `git mv` back to `docs/problems/known-error/` (root cause + workaround are documented, so it re-enters at Known Error, not Open).
- **Date parked**: 2026-07-24

## Related

- Hang-off-check verdict 2026-07-20 (capture-problem sub-step 2b): PROCEED_NEW. Candidate considered: P061 (work-problems iter briefing carries another ticket's evaluator caveat) — shares only the word "briefing"; P061's defect is upstream `@windyroad/itil` orchestrator iter-prompt assembly cross-wiring (wrong content injected), this ticket is the local wr-retrospective SessionStart docs/BRIEFING.md injection surface (correct content silently missing); different pipeline stage, plugin, and fix owner. Incidental link: P061's workaround note lives in the legacy BRIEFING.md — one of the entries this ticket shows is invisible to AFK iters.
- docs/BRIEFING.md line 37 — the external-comms `--body-file` trap entry whose invisibility drove this capture
- windyroad/agent-plugins#368, windyroad/agent-plugins#370 — the two filings that each paid the re-derivation cost

(captured via /wr-itil:capture-problem; expand at next investigation)
