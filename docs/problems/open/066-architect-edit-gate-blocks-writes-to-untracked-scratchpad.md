# Problem 066: `wr-architect` edit gate blocks Write to untracked `scratchpad/` files

**Status**: Open
**Reported**: 2026-07-26
**Priority**: 6 (Medium) — Impact: Minor (2) × Likelihood: Possible (3) — derived at capture from the description per Step 4a. Impact 2: no user or service effect; the cost is held drafts and re-derivation. Likelihood 3: recurs on any iter that wants scratch space, which is a routine want during multi-step work.
**Origin**: internal
**Effort**: S — derived at capture: a path-scope exclusion in the gate's matcher, one file — cf. P031 (S), the same gate family
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

> **Anchoring note (2026-07-26)**: captured mid-iter with `persona=plugin-developer, jtbd=JTBD-001` supplied by the orchestrator. Those are the **upstream `agent-plugins` home-repo** enum values; this repo has no `plugin-developer` persona and its `JTBD-001` is "search autocomplete addresses" (web-app-developer), which is unrelated. Re-anchored to `addressr-maintainer` / `JTBD-400` per the P383 adopter-portability rule and the P061 precedent (user correction 2026-07-24).

## Description

The `wr-architect` PreToolUse edit gate blocks `Write` to files under `scratchpad/`, an untracked directory that exists only to hold working drafts. The gate's purpose is to force architecture review before project files change; a scratch file is not a project file, is not committed, and carries no architectural decision. Blocking it produces the gate's cost with none of its benefit.

The practical consequence is that iter drafts have to be held in conversation context instead of on disk. That is worse on two counts: context is the scarcer resource, and anything held only in context is lost when the session ends. This repo already has a memory entry recording that lost scratchpad files have to be recovered from prior sessions' JSONL transcripts, which is the recovery path this gate makes more likely to be needed.

The scope question is the ticket: scratch space arguably belongs **outside** the architect gate's remit entirely, alongside the exclusions the gate already carries for lockfiles, CSS, images, and `docs/problems/`.

## Symptoms

- `Write` to a path under `scratchpad/` returns a `permissionDecision: "deny"` from the architect gate.
- Drafts that would naturally live on disk are held in context instead, inflating context usage and evaporating at session end.
- The gate fires on a directory that is untracked, so nothing it blocks could ever reach a commit for the architect to review anyway.

## Workaround

Hold the draft in conversation context, or route it into a path the gate already excludes. Neither is good: the first loses the work at session end, the second puts scratch content somewhere it does not belong.

## Impact Assessment

- **Who is affected**: any session doing multi-step work that wants a disk-backed scratch file — most obviously AFK iters, which are long-running and context-pressured.
- **Frequency**: whenever scratch space is wanted; observed this session.
- **Severity**: Minor — workflow friction and avoidable context spend, with a real but bounded work-loss risk at session boundaries.
- **Analytics**: N/A

## Root Cause Analysis

### Preliminary Hypothesis

The architect gate's scope is defined as "all project files" with a named exclusion list (CSS/SCSS, image assets, lockfiles, fonts, `docs/problems/`, `docs/BRIEFING.md`, `RISK-POLICY.md`, `.changeset/`, memory files, plan files, `docs/jtbd/`, and others). `scratchpad/` is not on that list, so it inherits the default-deny. The exclusion list appears to have been assembled from _categories of committed file that need no architecture review_ — untracked scratch space is a different category that was never considered, rather than one considered and rejected.

Worth checking whether the right fix is a `scratchpad/` exclusion specifically, or the more general rule that git-untracked paths fall outside the gate. The general rule is more principled but has a wider blast radius, since it would also exempt a not-yet-added new source file.

### Investigation Tasks

- [ ] Locate the gate's path-scope matcher in the installed `wr-architect` plugin and record the file:line for the exclusion list
- [ ] Reproduce: attempt a `Write` to an untracked `scratchpad/` path and capture the deny payload
- [ ] Decide the fix shape — `scratchpad/` path exclusion vs a general untracked-path exemption — weighing the new-source-file case against the second option
- [ ] Determine whether the fix is local config or belongs upstream in `@windyroad/wr-architect`, and route accordingly

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none yet) — pending the local-config vs upstream determination in the Investigation Tasks
- **Composes with**: P031, P046 (same gate family)

## Related

- **P031** (`docs/problems/known-error/031-create-adr-skill-does-not-auto-satisfy-edit-gate-hooks.md`) — the same architect edit gate, different friction; `windyroad/agent-plugins#364`.
- **P046** (`docs/problems/open/046-wr-architect-oversight-marker-multi-agent-sid-and-relative-path.md`) — architect oversight-marker friction in multi-agent sessions.
- Memory `reference_scratchpad_not_persistent.md` — records that session scratchpads are wiped between sessions and lost files have to be recovered from prior JSONL transcripts; this gate pushes more content into exactly that fragile path.
- Captured via `/wr-itil:work-problems` iter, 2026-07-26 (manual capture-problem steps; Skill tool erroring this session).
