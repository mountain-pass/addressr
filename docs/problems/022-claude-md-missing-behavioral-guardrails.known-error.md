# Problem 022: CLAUDE.md missing Risk Gate and Verification Ownership guardrails

**Status**: Known Error
**Reported**: 2026-04-18
**Priority**: 6 (Medium) — Impact: Minor (2) x Likelihood: Possible (3)

## Description

Usage-data analysis (86 sessions, 2026-03-17 → 2026-04-16) identified two recurring behavioral misses not codified in `CLAUDE.md`:

1. **Risk & Release Gates** — Claude attempted releases with risk scores above appetite (one incident at 6/25 above threshold 5), forcing user interruption. The hook proposed in P021 will enforce this at the tool layer, but a prompt-layer CLAUDE.md section reinforces the rule when hooks are absent or bypassed and provides the user-facing narrative for why the gate exists.
2. **Verification Ownership** — Claude asked the user to run verification commands that Claude could have run directly, slowing the feedback loop. Direct quote from the report: "User had to interrupt and redirect Claude after Claude asked them to run verification manually."

Neither rule currently appears in `CLAUDE.md`.

## Symptoms

- Risk-above-appetite release attempts — see P021 for full context.
- Claude asks user to run `curl` / `gh` / `git` / `npm` commands that Claude could execute itself, then paste results back.
- Recurring "FFS" friction moments captured in the month-wide report.

## Workaround

- User manually reinforces these rules per session.
- P016 covers the voice/tone corner of this same pattern. BATS-discipline corner does not apply to addressr (no BATS tests here).

## Impact Assessment

- **Who is affected**: Addressr maintainer (primary — this is their workflow overhead); indirectly, anyone touched by a risky release.
- **Frequency**: Per-session reinforcement needed. Quantifiable in the usage-data report.
- **Severity**: Minor — no user-visible defect; quality-of-workflow and reliability-of-gates concern.
- **Analytics**: Usage-data report (1,464 messages, 86 sessions).

## Root Cause Analysis

### Finding

`CLAUDE.md` covers accessibility enforcement and references DECISION-MANAGEMENT.md for ADR workflow, but does not explicitly state:

- Never attempt a release when risk is above appetite; stop and escalate.
- Run verification commands yourself unless they require credentials you lack.

### Fix Strategy (proposed)

Add two short sections to `CLAUDE.md` (or to `AGENTS.md` if that is the canonical place — CLAUDE.md at project root delegates to AGENTS.md):

```markdown
## Risk & Release Gates

- NEVER attempt `git push origin master`, a release workflow, or any publish when the risk scorer reports a residual score above the RISK-POLICY.md appetite (currently 5). Stop and escalate.
- Always verify CI is fully green (lint, coverage, licenses, tests, risk gates) before proposing a release.
- If a risk gate blocks, report the score and wait for explicit user approval before retrying.

## Verification Ownership

- Run verification commands (curl, gh, git, npm, test runners) yourself and show the output. Do not ask the user to run them unless they require credentials or resources you lack (1Password, production consoles, interactive auth).
- If a command could be constructed and run safely, construct it and run it; don't offload the shell to the user.
```

Text is short and reinforces invariants the user already wants enforced. Redundancy with P021 (hook) is intentional — prompt layer + tool layer defense-in-depth.

## Investigation Tasks

- [ ] Decide placement: `CLAUDE.md` at project root, or `AGENTS.md` (currently referenced by CLAUDE.md). Keep both in sync or pick one canonical.
- [ ] Confirm the exact wording — thin to ~4 bullets each section.
- [ ] Check for conflicts with existing CLAUDE.md rules (accessibility, decision management).
- [ ] Verify the rule does not contradict any ADR.
- [ ] Commit with a clear message so the addition is auditable.

## Related

- [P021: git push origin master is not risk-gated](021-git-push-master-not-risk-gated.open.md) — hook-layer enforcement this ticket mirrors at the prompt layer.
- [P016: External comms missing voice-tone and risk checks](016-external-comms-missing-voice-tone-and-risk-checks.open.md) — voice/tone corner of the same family. Already covered by docs/VOICE-AND-TONE.md + hook.
- Usage-data report 2026-03-17 → 2026-04-16 — source of the recurring-pattern evidence.
- `CLAUDE.md`, `AGENTS.md` — target docs for the additions.
- RISK-POLICY.md — appetite threshold referenced by the Risk Gates section.
