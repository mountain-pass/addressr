# Problem 021: `git push origin master` is not risk-gated — risk scorer is advisory only

**Status**: Known Error
**Reported**: 2026-04-18
**Priority**: 9 (Medium) — Impact: Moderate (3) x Likelihood: Possible (3)

## Description

The risk scorer (`wr-risk-scorer:pipeline`) writes `/tmp/risk-*.md` markers via a PostToolUse hook and emits `RISK_SCORES: commit=N push=N release=N` lines. Nothing reads those markers and blocks the release. Since addressr ships via the changesets GitHub Action triggered by `git push origin master` (no local `npm publish` or `changeset publish` — those run inside the release workflow), the operative release gate must sit at the push step.

The month-wide usage-data report (86 sessions, 2026-03-17 → 2026-04-16) documents recurring attempts by Claude to release with risk scores above appetite — one specific incident at 6/25 above the RISK-POLICY.md threshold of 5. The user has been the sole enforcement of the risk gate; this is fragile across sessions and easy to miss.

## Symptoms

- Risk scorer reports `RISK_SCORES: push=N` above appetite, but a subsequent `git push origin master` still succeeds because nothing reads the score.
- The release workflow on master kicks off regardless, shipping whatever is on master to npm/Docker/AWS.
- Enforcement has relied on the user manually challenging Claude; month-wide data shows this isn't reliable.

## Workaround

- User manually inspects the risk-scorer output before allowing a push.
- Risk-scorer output is loud in the transcript, which helps but is not a hard gate.

## Impact Assessment

- **Who is affected**: RapidAPI consumers (paid and free-tier) of the live service when a risky change ships; Addressr maintainer via incident recovery; Self-hosted operator who pulls the next npm release.
- **Frequency**: Every release. The gate is latent across all pushes to master.
- **Severity**: Moderate — no concrete defect has shipped as a result yet (the user has caught each near-miss), but the pattern recurs and compounds across releases.
- **Analytics**: N/A — evidence from usage-data report.

## Root Cause Analysis

### Finding

The risk scorer runs post-facto (PostToolUse after a Bash or Agent call) and writes scores but does not enforce them. The commit hook pipeline (`.husky/pre-commit` → `lint-staged && npm run check-licenses && npm run check:not-cli2-tags`) does not read risk scores. No PreToolUse hook matches `git push`.

### Fix Strategy (proposed)

Add a PreToolUse hook (settings.json) that:

1. Matches `Bash` tool calls whose command regex contains `git push` AND a target ref on master (e.g., `origin\s+master`, `origin\s+HEAD(:master)?`, or a bare `git push` from a branch tracked to master).
2. Locates the latest `/tmp/risk-*-push.md` by mtime; if absent, either re-run the risk scorer or refuse the push (design call).
3. Greps the `RISK_SCORES: ... push=N` line (or parses the report's residual score) and compares against the appetite threshold from `RISK-POLICY.md` (currently 5). Reads the threshold dynamically so future RISK-POLICY.md edits don't require hook code changes.
4. Exits with `permissionDecision: "deny"` and a clear message naming the score, threshold, and remediation steps.
5. Provides an explicit override mechanism (e.g., `RISK_ACCEPTED=<score-hash>` env var, or a one-shot bypass marker file the user creates) so the user can unblock legitimately.

Integrate with the existing risk-scorer flow rather than duplicating score computation — the hook only enforces, it doesn't re-score.

## Investigation Tasks

- [ ] Decide the bypass mechanism (env var, marker file, or `--no-verify`-style — but per project guidance, never use `--no-verify` silently).
- [ ] Decide fallback when `/tmp/risk-*-push.md` is stale or missing: refuse push, or re-run scorer, or warn.
- [ ] Inventory all push-shaped commands users run (`git push`, `git push -u origin master`, `gh workflow run release.yml`, `git push --force-with-lease` — should force-pushes bypass or still be gated?).
- [ ] Write a failing test: simulate risk=6 push attempt and assert the hook blocks.
- [ ] Implement the hook in settings.json + a `.claude/scripts/check-push-risk.sh` helper.
- [ ] Add documentation to CLAUDE.md about the gate and how to override when appropriate (complements P022 prose).

## Related

- [P022: CLAUDE.md missing risk-gate and verification-ownership guardrails](022-claude-md-missing-behavioral-guardrails.open.md) — prompt-layer mirror of this hook-layer enforcement.
- [P016: External comms missing voice-tone and risk checks](016-external-comms-missing-voice-tone-and-risk-checks.open.md) — adjacent pattern: missing process gate on external-facing actions.
- RISK-POLICY.md — the appetite threshold (5) this hook will read.
- `.husky/pre-commit` and `package.json` `pre-commit` script — existing commit-time gates (lint-staged, licenses, cli2-tags) that do not cover push risk.
- Usage-data report 2026-03-17 → 2026-04-16 — evidence of recurring pattern.
