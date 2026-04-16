# Problem 016: External comms posted without voice/tone check or risk assessment

**Status**: Open
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

### Investigation Tasks

- [ ] Check whether a `docs/VOICE-AND-TONE.md` guide exists; if not, create one via `/wr-voice-tone:update-guide` before fixing this problem
- [ ] Determine where the external comms workflow should be enforced — hook, skill instruction, or CLAUDE.md rule
- [ ] Add a pre-comms checklist to the agent workflow: (1) voice/tone check, (2) risk/reputational assessment, (3) user review for anything posted publicly
- [ ] Consider whether a `manage-external-comms` skill or hook is warranted to gate GitHub comments the same way `wr-risk-scorer:pipeline` gates commits

## Related

- GitHub issue [#388](https://github.com/mountain-pass/addressr/issues/388) — the incident that surfaced this problem
- `wr-voice-tone:update-guide` skill — would create `docs/VOICE-AND-TONE.md`
