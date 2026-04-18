# AGENTS.md

## Operating Alignment

All agent work in this repo must align with:

- `PRINCIPLES.md` (especially locality/simplicity, flow/feedback speed, customer focus, and deterministic vs LLM split)
- `AGENTIC_RISK_REGISTER.md`
- `governance/control-traceability.json`

When uncertain, prefer the option that improves feedback speed and keeps changes small and recoverable.
Apply Gall's law in delivery decisions: start from a working simple slice, then earn complexity incrementally through validated trunk feedback.

## Trunk-Based Delivery

- Use trunk-based development on `master`.
- Follow `docs/RED_TRUNK_PLAYBOOK.md` when trunk is red.
- Treat release controls as defined in:
  - `docs/GITHUB_RULESETS.md`
  - `.github/workflows/release.yml`

## Architecture and Decisions

- Keep architecture docs in sync with code:
  - `/c4` (regenerate C4 diagrams from source)
  - `/c4-check` (verify diagrams are up to date)
  - `docs/architecture/C4_MODEL.md`
- Record significant architecture and build-vs-buy decisions under `docs/decisions/`.
- Keep `docs/decisions/README.md` updated for locality and traceability.

## Controls and Safety

- Deterministic controls are enforced via `package.json` scripts, git hooks, and CI.
- Do not bypass controls; if a control is noisy or ineffective, propose a change traced to risks in:
  - `AGENTIC_RISK_REGISTER.md`
  - `governance/control-traceability.json`

## Risk & Release Gates

_Codifies the prompt-layer expectations that back ADR-001 (Risk-Gated Release Process) and `RISK-POLICY.md`. Prompt layer + tool layer are defense-in-depth; neither replaces the other._

- NEVER attempt `git push origin master`, a release workflow, or any publish when the risk scorer reports a residual score above the `RISK-POLICY.md` appetite (currently 5; see ADR-001). Stop and escalate.
- Before proposing a release, verify the latest master CI run is green (lint, coverage, licenses, tests, risk gates) — do not rely on assumed-green.
- If a risk gate blocks, report the score and wait for explicit user approval before retrying. Do not silently rescore or re-run to try to get a different number.

## Verification Ownership

- Run verification commands (curl, gh, git, npm, test runners) yourself and show the output. Prefer piping the actual output into the response over summarising it when the user asked for evidence.
- Do not ask the user to run commands unless they require credentials or resources you lack (1Password, production consoles, interactive auth).
- If a command could be constructed and run safely, construct it and run it; don't offload the shell to the user.

## Completion Protocol (Default)

- Unless explicitly told otherwise, when a task is complete:
  - Commit all intended changes.
  - Add a changeset when the change is release-relevant.
  - Push to `master`.
  - Monitor the resulting pipeline(s) to completion.
  - If any pipeline fails, treat recovery as highest priority and push only pipeline-fix commits until trunk is green again.
  - If a changeset is present (or a release PR is created/updated), also monitor release PR checks to completion.
  - If any release PR check fails or remains expected/pending due to misconfiguration, treat recovery as highest priority and push only release-pipeline/release-policy fix commits until the release PR is mergeable without bypass.

## Changeset Quality

- Treat changesets as reviewer-facing release notes, not internal scratch notes.
- For release-relevant work, add changesets regularly (do not batch too much scope between changesets).

Good changesets:

- Scoped: one product/behavior slice per changeset.
- User-impact first: describe what changed for users/operators, not only file-level edits.
- Specific and verifiable: mention concrete behavior, API, workflow, or control changes.
- Risk-aware: call out notable operational or release implications when relevant.
- Small and reviewable: easy to map from diff -> changeset -> release decision.

Bad changesets:

- Vague text ("misc fixes", "updates", "cleanup").
- Mechanical restatement of file edits without behavior impact.
- Overloaded scope mixing unrelated changes into one entry.
- Missing changeset for release-relevant changes.
- Overly noisy churn changesets for non-release/internal-only edits.

Quick examples:

- Good: "Persist Google sign-in across reload and auto-project on input/sign-in changes; remove false unauthenticated startup error in reviewer UI."
- Bad: "Updated ui files and tests."
