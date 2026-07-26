# Problem 062: AFK iter subprocess sessions missing docs/BRIEFING.md content

**Status**: Verification Pending
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
- [x] Reconcile ADR-019 — superseded by ADR-038 (`c3429b4`), unblocking the fix
- [x] Run the migration — `wr-retrospective-migrate-briefing` (`d7b7e1c`)
- [ ] Verify a subsequent session/AFK iter actually receives `docs/briefing/` content

## Fix Strategy

Run `/wr-retrospective:migrate-briefing` (idempotent, foreground-synchronous; the wr-retrospective shim `wr-retrospective-migrate-briefing`). It splits legacy `docs/BRIEFING.md` by H2 into `docs/briefing/<slug>.md`, writes `docs/briefing/README.md` with a `## Critical Points (Session-Start Surface)` placeholder (populated later by `/wr-retrospective:run-retro`), retires the legacy file to `docs/BRIEFING.md.migrated-<date>`, and self-commits per ADR-014. Dry-run 2026-07-24 confirmed the plan: two topic files (`what-you-need-to-know.md`, `what-will-surprise-you.md`) + index + rename. Once `docs/briefing/README.md` exists with a non-empty Critical Points section, the SessionStart hook surfaces it. The I13 fix-time RFC-trace gate (`wr-itil-check-fix-rfc-trace`) returns `no-rfc-trace: P062` — a fix-time RFC must be auto-created via `/wr-itil:capture-rfc --fix-time` before the migration lands.

**Un-blocked and fixed 2026-07-26** (user present, directed the supersession-then-fix sequence):

The prior block was decision-record drift — the migration diverged from **ADR-019** (`human-oversight: confirmed` 2026-07-18), whose Decision Outcome recorded the single-file `docs/BRIEFING.md` + `UserPromptSubmit` design. Reconciling it was a user governance call. Resolved by supersession rather than in-place amendment, because the mechanism changed wholesale (different hook event, different path, different extraction) and an in-place edit would have erased the record of what was previously decided.

## Fix Committed

- **`c3429b4`** — `docs(decisions)`: ADR-019 superseded by **ADR-038** (Per-Topic Briefing Tree Surfaced at Session Start), which records the shipped contract: injection is plugin-owned (`wr-retrospective` 0.27.0 `SessionStart` hook), the `docs/briefing/` tree and its `## Critical Points (Session-Start Surface)` roll-up are this repo's. Compendium regenerated. Architect gate PASS (4 passes; caught two dead ADR-001 links), JTBD gate PASS (JTBD-400).
- **`d7b7e1c`** — `fix(briefing)`: ran `wr-retrospective-migrate-briefing` (idempotent). Split the legacy file by H2 into `docs/briefing/what-you-need-to-know.md` + `what-will-surprise-you.md`, wrote `docs/briefing/README.md` carrying the exact heading the hook matches, retired the legacy file to `docs/BRIEFING.md.migrated-2026-07-26`.

In-session check: running the installed hook with `CLAUDE_PROJECT_DIR` set to the repo now emits the `CROSS-SESSION BRIEFING — critical points` block instead of silently exiting.

## Verification

**Criterion**: a subsequent session or AFK iter receives `docs/briefing/` content in its injected context (the `CROSS-SESSION BRIEFING` block), where today it receives none.

**Caveat that gates closure**: the Critical Points roll-up is still the migration placeholder, so what gets injected is currently one placeholder line, not the institutional knowledge itself. The bullets that cost the #368/#370 round-trips live in `what-will-surprise-you.md`, reachable on demand but below the H2 the hook stops at. `/wr-retrospective:run-retro` populates the roll-up from its signal-vs-noise pass. Do not close on the banner appearing alone — close when a session receives roll-up content with substance in it.

_Future consideration (not actioned, no ticket): the institutional-context theme has no precise JTBD home. A future `addressr-maintainer` job along the lines of "each working session starts with the institutional context it needs" would fit better than JTBD-400. Raise at a future `/wr-jtbd` review._

_JTBD advisory (non-blocking):_ JTBD-400 trace is thematically sound but imprecise — the demonstrated harm is per-session institutional-context loss, not a release-pipeline defect; a future JTBD refinement could add an addressr-maintainer job "each working session has the institutional context it needs."

## Dependencies

- **Blocks**: (none)
- **Blocked by**: ~~ADR-019 reconciliation~~ — cleared 2026-07-26 by the ADR-038 supersession (`c3429b4`).
- **Composes with**: (none)

## Un-parked

Parked 2026-07-24 pending a user governance decision on reconciling confirmed ADR-019; un-parked 2026-07-26 when the user directed the supersession. Went straight to Verification Pending rather than back to Known Error, because the fix landed in the same session as the un-park.

Two items from the parked-era fix path were deliberately not done: no fix-time RFC was captured (the I13 `wr-itil-check-fix-rfc-trace` note recorded at park time), and no new JTBD was authored. Both were out of scope for this tightly-scoped iteration by user direction. Neither gate blocked the commits.

## Related

- Hang-off-check verdict 2026-07-20 (capture-problem sub-step 2b): PROCEED_NEW. Candidate considered: P061 (work-problems iter briefing carries another ticket's evaluator caveat) — shares only the word "briefing"; P061's defect is upstream `@windyroad/itil` orchestrator iter-prompt assembly cross-wiring (wrong content injected), this ticket is the local wr-retrospective SessionStart docs/BRIEFING.md injection surface (correct content silently missing); different pipeline stage, plugin, and fix owner. Incidental link: P061's workaround note lives in the legacy BRIEFING.md — one of the entries this ticket shows is invisible to AFK iters.
- docs/BRIEFING.md line 37 — the external-comms `--body-file` trap entry whose invisibility drove this capture
- windyroad/agent-plugins#368, windyroad/agent-plugins#370 — the two filings that each paid the re-derivation cost

(captured via /wr-itil:capture-problem; expand at next investigation)
