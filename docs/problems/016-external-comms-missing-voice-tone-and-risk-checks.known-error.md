# Problem 016: External comms posted without voice/tone check or risk assessment

**Status**: Known Error
**Reported**: 2026-04-17
**Priority**: 15 (High) — Impact: Moderate (3) x Likelihood: Almost certain (5)

## Description

When responding to GitHub issues (or any external channel), the agent posted comments without running a voice and tone check or a risk assessment first. The first draft used em dashes and AI-typical phrasing, and said "we'll keep this open" on an issue that had been open since 2024. The user had to correct both before the comments were acceptable.

Without a process gate, this will recur on every external comms task.

## Symptoms

- GitHub comments posted with AI-generation markers (em dashes, filler phrases like "Thanks again for reporting this!", "Happy to keep this open").
- No voice and tone review run before posting.
- No risk assessment run before posting (external comms carry reputational risk distinct from code changes).
- User had to request rewrites after the fact.

## Workaround

User manually reviews and requests corrections after the fact.

## Impact Assessment

- **Who is affected**: Anyone who receives external communications from the project (GitHub issue reporters, contributors, customers).
- **Frequency**: Every external comms task — GitHub issue responses, release notes, announcements.
- **Severity**: Moderate — off-brand or poorly worded public comments reflect on the project and its maintainers. Does not affect service availability but affects reputation and trust.
- **Analytics**: N/A

## Root Cause Analysis

### Confirmed Root Cause (2026-04-19)

The `wr-voice-tone` plugin hook (`~/.claude/plugins/cache/windyroad/wr-voice-tone/0.2.1/hooks/voice-tone-enforce-edit.sh`) gates only user-facing UI file extensions:

```
*.html|*.jsx|*.tsx|*.vue|*.svelte|*.ejs|*.hbs
```

And the `UserPromptSubmit` detection (`voice-tone-eval.sh`) injects the delegation instruction only when the prompt touches those same extensions. External-comms surfaces sit entirely outside this scope:

- `gh issue comment`, `gh issue edit`, `gh issue create`, `gh pr comment`, `gh pr edit`, `gh pr create`, `gh release create` — all run via the `Bash` tool, not `Edit`/`Write`, and the voice-tone plugin has no `PreToolUse:Bash` matcher.
- `.changeset/*.md` files — `.md` is not in the enforced extension list, so release-note copy escapes review.
- Commit messages — passed via `git commit -m` through `Bash`, not through the Edit/Write gate.
- PR descriptions, issue bodies, release-note bodies — all authored via `gh` HEREDOCs.

There is also no risk-scorer equivalent for external comms. `wr-risk-scorer:pipeline` scores code-pipeline actions (commit/push/release) but does not assess reputational/brand risk of external-facing text.

The prompt-layer fallback (CLAUDE.md "Accessibility-First" and the voice-tone `UserPromptSubmit` inject) is scoped to the same UI file extensions and is therefore silent when the prompt is about posting to GitHub. This is the pattern that failed in the P016 incident: Claude had no hook, no prompt injection, and no CLAUDE.md rule that fired when "respond to GitHub issue" was the task.

### Investigation Tasks

- [x] Check whether a `docs/VOICE-AND-TONE.md` guide exists — created via `/wr-voice-tone:update-guide` prior to this ticket's re-review (the guide is in place)
- [x] Read the voice-tone plugin hook scope — confirmed gates `Edit|Write` on UI extensions only; no `Bash` matcher for `gh` commands; no `.md` coverage
- [ ] Determine where the external comms workflow should be enforced — hook, skill instruction, or CLAUDE.md rule (design decision — see Fix Strategy)
- [ ] Add a pre-comms checklist to the agent workflow — depends on enforcement decision
- [ ] Consider whether a `manage-external-comms` skill or hook is warranted — one of the candidate fixes below

## Workaround (current)

User manually reviews external comms drafts and requests rewrites before they are posted. This is the same workaround captured in the original ticket — it is fragile across sessions (see month-wide evidence below) but is the active control today.

Per-session author-level reinforcement: this ticket now explicitly documents the gap so the pattern is visible to the agent at problem-review time. That is not a systemic fix.

## Fix Strategy (candidates — no decision)

Each option changes developer workflow and warrants a conversation before implementation. Listed in rough order of narrowest to broadest scope.

1. **Extend voice-tone plugin hook scope (upstream edit).** Add `.md` files and `gh` bash commands to the plugin's hook matchers. Narrow and systemic — covers every project the plugin is enabled in. Scope: upstream `windyroad/wr-voice-tone` plugin repo; new tagged release; no addressr-repo changes. Mirrors the disposition already chosen for P024 (governance fixes land upstream, not in addressr).

2. **Add a local PreToolUse:Bash hook in `.claude/settings.json`.** Matches `gh issue|pr|release create|comment|edit` and requires voice-tone review. Fast to land in addressr only; does not help other projects. Risk: hook-layer drift between projects if the pattern is duplicated by hand rather than shared via a plugin.

3. **Add a dedicated `manage-external-comms` skill.** Wraps `gh` commands with a voice-tone + risk pre-flight, similar to how `manage-problem` wraps problem-ticket lifecycle. Most explicit, most disciplined, but requires building and maintaining a new skill.

4. **Add a CLAUDE.md prose rule "run voice-tone and risk checks before any external comms."** Zero infrastructure. Same prompt-layer pattern that P022 used for risk-gate reinforcement. Weakest enforcement — relies on agent compliance and is exactly the failure mode documented in this ticket (the agent did not run checks even though CLAUDE.md rules existed for other topics).

Combinations are fine: option 1 upstream + option 4 locally as an interim is a plausible landing zone.

## Fix Released

Not released. This ticket remains Known Error pending a user decision on which candidate fix (or combination) to pursue. The author-level per-session reinforcement (described under Workaround) is in place today; once a systemic fix lands, the "Fix Released" section will be added and the ticket closed after user verification.

## Month-wide Evidence

The 2026-04-18 usage-data report (1,464 messages, 86 sessions, 2026-03-17 → 2026-04-16) shows this pattern recurring across multiple sessions, not just issue #388:

- Direct quote from the report: "Claude's GitHub comments used AI-sounding language (em dashes, hedging, 'keep ticket open' on a 2024 issue) triggering your 'FFS' frustration response because no voice/tone check ran before posting."
- The report categorises this under "Missing voice/risk checks on external output" and recommends "Adding a mandatory voice-and-tone and risk pass before any external comms or outage conclusions."
- The report's "FFS" frustration signal appears in multiple sessions, not a single isolated incident.
- Issue age check ("keep ticket open" on a 2024 issue) is an adjacent failure mode in the same family — external comms produced without context awareness.

This evidence raises the realism of the Likelihood score and should inform the next WSJF review of P016.

## Related

- GitHub issue [#388](https://github.com/mountain-pass/addressr/issues/388) — the incident that first surfaced this problem
- Usage-data report 2026-03-17 → 2026-04-16 — month-wide evidence that this pattern recurs
- `wr-voice-tone:update-guide` skill — created `docs/VOICE-AND-TONE.md` (now exists)
- [P021: git push origin master is not risk-gated](021-git-push-master-not-risk-gated.open.md) — adjacent family: missing process gate on release actions
- [P022: CLAUDE.md missing behavioral guardrails](022-claude-md-missing-behavioral-guardrails.open.md) — adjacent family: prompt-layer behavioral gaps
