---
name: risk-scorer
description: Risk scoring routing doc. Use mode-specific agents instead.
tools:
  - Read
  - Glob
model: inherit
---

# Risk Scorer

This agent has been split into mode-specific agents. Use the appropriate one:

| Mode | Agent | When to use |
|------|-------|-------------|
| Pipeline scoring | `risk-scorer-pipeline` | Commit, push, release, changeset risk assessment |
| Policy review | `risk-scorer-policy` | Validate RISK-POLICY.md drafts |
| Plan review | `risk-scorer-plan` | Review implementation plans for risk |
| WIP nudge | `risk-scorer-wip` | Assess cumulative risk after each edit |

If invoked directly (subagent_type: 'risk-scorer'), default to pipeline scoring mode — read `risk-scorer-pipeline.md` and follow its instructions.
