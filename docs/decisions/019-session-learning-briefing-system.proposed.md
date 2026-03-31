---
status: proposed
date: 2026-03-31
decision-makers: [Tom Howard]
consulted: [Claude Code]
informed: []
---

# ADR 019: Session Learning and Briefing System

## Context and Problem Statement

When a new Claude Code session starts, the agent has no knowledge of what previous sessions learned — what was surprising, what was harder than expected, what the project's non-obvious characteristics are. This leads to repeated discovery of the same issues (e.g., "production runs v2 API not v1", "CI doesn't test what production runs", "Dockerfile is stale").

Additionally, things that fail or are harder than they should be are not systematically captured as problems for future resolution.

## Decision Drivers

- Reduce repeated discovery of non-obvious project characteristics across sessions
- Capture institutional knowledge that isn't derivable from code alone
- Systematically track things that fail or are unnecessarily difficult
- Keep the briefing current — remove stale learnings, add new ones

## Considered Options

1. **BRIEFING.md + retrospective skill** — a committed file injected at session start, maintained by a `/retrospective` skill at session end, with problem ticket creation for failures
2. **Memory files only** — use the `.claude/` memory system for all cross-session knowledge
3. **CLAUDE.md additions** — add a "Project Context" section to CLAUDE.md
4. **No cross-session learning** — rely on code, ADRs, and problem tickets alone

## Decision Outcome

**Option 1: BRIEFING.md + retrospective skill.**

Components:
- **`docs/BRIEFING.md`** — committed file with "What you need to know" and "What will surprise you" sections. Injected into every conversation via UserPromptSubmit hook.
- **`/retrospective` skill** — invoked at session end. Reflects on the session, updates BRIEFING.md (add new learnings, remove stale ones), and creates/updates problem tickets for failures and friction.
- **Stop hook** — reminds to run `/retrospective` before ending.
- **UserPromptSubmit hook** — reads BRIEFING.md and injects as additionalContext.

Governance: BRIEFING.md edits go through the normal commit flow (risk-scored, architect-reviewed). The retrospective skill writes the file; the human reviews the diff before committing.

Staleness criteria: a learning is stale when it's been addressed (e.g., "CI doesn't test v2" becomes stale once v2 tests are added to CI) or when it's now documented elsewhere (e.g., in an ADR or CLAUDE.md).

### Consequences

- Good: New sessions start with institutional knowledge from previous sessions
- Good: Failures and friction are systematically captured as problem tickets
- Good: BRIEFING.md is version-controlled and reviewable
- Good: Staleness is managed by the retrospective skill
- Neutral: Adds one more UserPromptSubmit hook (token budget impact ~500 tokens for a typical briefing)
- Bad: AI-maintained committed file is a novel pattern — quality depends on the retrospective skill's judgment
- Bad: Requires discipline to run `/retrospective` (mitigated by Stop hook reminder)

### Confirmation

- `docs/BRIEFING.md` exists and is injected into conversations
- `/retrospective` skill updates BRIEFING.md and creates problem tickets
- Stop hook shows reminder when session ends
- New sessions receive briefing context without manual intervention

### Reassessment Criteria

- BRIEFING.md growing too large (> 2000 tokens) — may need to be pruned or restructured
- Briefing content becoming stale despite retrospective runs
- Token budget constraints making the injection impractical
