# Session Retrospective

Reflect on the current session, update the project briefing, and create problem tickets for failures and friction.

## Steps

### 1. Read the current briefing

Read `docs/BRIEFING.md` to understand what previous sessions already captured.

### 2. Reflect on this session

Consider the work done in this session and identify:

**What you wish you'd been told up front** — things that were non-obvious and caused wasted effort or wrong assumptions. These should be added to BRIEFING.md "What You Need to Know" if they aren't already there.

**What surprised you** — things that contradicted reasonable expectations. These should be added to BRIEFING.md "What Will Surprise You" if they aren't already there.

**What was harder than it should have been** — friction points, tool limitations, process overhead, confusing code. These should become problem tickets via the `/problem` skill.

**What failed** — things that broke, bugs encountered, hooks that errored, tests that failed unexpectedly. These should become problem tickets via the `/problem` skill.

**What should we make easier or automate** — repetitive manual steps, missing tooling, things that could be scripted. These should become problem tickets via the `/problem` skill.

### 3. Update BRIEFING.md

Edit `docs/BRIEFING.md`:

- **Add** new learnings to the appropriate section ("What You Need to Know" or "What Will Surprise You")
- **Remove** stale items that are no longer true. A learning is stale when:
  - The issue has been fixed (e.g., "CI doesn't test v2" after v2 tests are added)
  - It's now documented elsewhere (e.g., in an ADR, CLAUDE.md, or README)
  - The codebase has changed enough that it's no longer relevant
- **Update** items where the details have changed
- Keep the file concise — under 2000 tokens. Each item should be 1-2 lines.

Use the AskUserQuestion tool to confirm any removals: "I'd like to remove [item] from BRIEFING.md because [reason]. Is this correct?"

### 4. Create or update problem tickets

For each item identified in "What was harder than it should have been", "What failed", and "What should we make easier or automate", use the `/problem` skill to:

- Check if a problem ticket already exists in `docs/problems/`
- If yes: update it with new evidence from this session
- If no: create a new problem ticket

### 5. Summary

Present a summary to the user:

```
## Session Retrospective

### BRIEFING.md Changes
- Added: [items added]
- Removed: [items removed with reasons]
- Updated: [items modified]

### Problems Created/Updated
- [problem ticket]: [summary]

### No Action Needed
- [learnings that were already captured]
```

$ARGUMENTS
