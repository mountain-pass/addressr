---
status: proposed
date: 2026-03-30
decision-makers: [Tom Howard]
consulted: [Claude Code]
informed: []
---

# ADR 001: Risk-Gated Release Process via release:watch

## Context and Problem Statement

Addressr currently has no gated release process. Merging the changesets release PR on master immediately triggers npm publish (`changesets/action`) and AWS deployment via Terraform. There is no mechanism to prevent releases when the accumulated changes carry elevated risk (e.g., large dependency upgrade batches, breaking changes, untested integrations).

The git-push-gate hook infrastructure already supports risk-score checks and references `npm run release:watch`, but the script does not exist yet.

## Decision Drivers

- Releases to npm and AWS should not proceed without a risk assessment
- The existing risk-scoring infrastructure (hooks, risk-scorer agent, RISK-POLICY.md) is already in place
- Direct `gh pr merge` of release PRs bypasses any gating mechanism
- The team needs visibility into release workflow success/failure
- The solution should be simple and not require new branches or CI workflow changes

## Considered Options

### Option 1: Risk-gated `release:watch` script

A bash script invoked via `npm run release:watch` that merges the changesets PR, watches the GitHub Actions workflow, and reports results. Gated by the existing git-push-gate hook's risk-score check.

- Good: Integrates with existing hook infrastructure — no new CI or GitHub config needed
- Good: Single command provides end-to-end release visibility (merge, watch, report)
- Good: Risk assessment enforced before every release
- Bad: Local script dependency — releases require a Claude Code session with hooks active
- Bad: Client-side gate can be bypassed by merging outside the hooked environment

### Option 2: Manual ungated process (status quo)

Continue with the current process where any merge of the changesets PR triggers release. Rely on human judgment and PR review alone.

- Good: Simple, no additional tooling
- Bad: No risk assessment gate — elevated-risk releases proceed unchecked
- Bad: No release workflow visibility — must check GitHub Actions UI manually

### Option 3: GitHub Actions environment protection rules

Use GitHub's built-in environment protection (required reviewers, wait timers) to gate the release workflow server-side.

- Good: Server-side enforcement — cannot be bypassed locally
- Good: Works regardless of local tooling
- Bad: No integration with the project's risk-scoring system
- Bad: Manual reviewer approval is a coarser gate than automated risk scoring
- Bad: Requires GitHub repository admin configuration

## Decision Outcome

**Option 1: Risk-gated `release:watch` script.**

It integrates with the existing hook infrastructure, provides a single command for the release workflow, and enforces risk assessment before releases proceed. No new branches, CI workflows, or GitHub configuration changes are required.

This decision covers:
- Creation of `scripts/release-watch.sh`
- Addition of `npm run release:watch` script entry in `package.json`
- The existing `git-push-gate.sh` hook that blocks direct `gh pr merge` and gates `release:watch` on the release risk score

## Confirmation

- `npm run release:watch` exists and executes `scripts/release-watch.sh`
- Running the script without a passing release risk gate results in a block from git-push-gate
- Direct `gh pr merge` of a release PR (title "chore: release") is intercepted and redirected to `release:watch`
- The script correctly identifies the changesets release PR, merges it, and watches the workflow

## Reassessment Criteria

- If the project moves to a different release mechanism (e.g., away from changesets)
- If GitHub Actions adds native risk-gating features that make the script redundant
- If the team grows and needs a server-side gate rather than a client-side one
- If a separate `publish` branch pattern is adopted (as in bbstats)
