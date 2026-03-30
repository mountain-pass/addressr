# Problem 007: Non-user-facing documentation must not affect risk scores or trigger drift detection

**Status**: Open
**Reported**: 2026-03-29
**Priority**: 8 (Medium) — Impact: Minor (2) x Likelihood: Likely (4)

## Description

Changes to non-user-facing documentation (problem tickets, decision records, risk reports, markdown files in `docs/`) are treated the same as code changes by the risk scoring and pipeline drift detection systems. This causes two problems:

1. **Risk scoring waste**: The risk scorer is invoked for docs-only changes and always returns 1/25 (Very Low). This is wasted compute and conversation time — docs cannot affect the running application.

2. **Pipeline state drift blocks**: The drift detection hash includes all uncommitted/unstaged files. When a doc file is created after the risk score is computed (e.g., creating a problem ticket between scoring and committing), the drift hash changes and blocks the gated action (commit, push, release). This forces re-scoring for changes that have zero risk.

## Symptoms

- Risk scorer runs on every prompt even when only docs changed, always returning 1/25
- "Pipeline state drift" blocks commits/pushes/releases when doc files are created mid-response
- Developer must re-submit prompts or manually write score files to work around drift detection
- The release gate was blocked because a a problem doc file was created after scoring

## Workaround

Re-submit the prompt after all doc files are staged, or manually write the risk score file.

## Impact Assessment

- **Who is affected**: Developer workflow — wasted time on scoring and drift workarounds
- **Frequency**: Multiple times per session — every time a problem ticket or doc is created
- **Severity**: Medium — significant friction but no data loss or user impact
- **Analytics**: This session: at least 3 drift blocks and 5+ unnecessary risk scorer invocations

## Root Cause Analysis

### Additional Evidence (2026-03-29)

**`printf` mtime bug**: When `printf '%s' '2' > /tmp/risk-push-*` writes the same content that already exists, the file mtime may not update on APFS (macOS). The TTL check in `risk-gate.sh` uses mtime to determine freshness. Writing the same score value results in a "score expired" error even though the score was just written. Workaround: `rm -f` the file before `printf`, then `touch` it.

This compounds P006 (TTL too short) — the score expires during long agent responses, and rewriting it doesn't fix the mtime, causing repeated blocks.

### Investigation Tasks

- [ ] Identify where the drift hash is computed (which hook script)
- [ ] Modify drift hash to exclude `docs/` directory files
- [ ] Modify risk scorer prompt injection to skip when only docs are changed
- [ ] Consider excluding `.risk-reports/` and `.changeset/` from drift hash too
- [ ] Fix mtime bug: use `rm -f` + `printf` (or `>|` clobber) instead of plain `printf` redirect

### Fix Strategy

1. **Drift hash**: Exclude `docs/**`, `.risk-reports/**`, `.changeset/**` from the git diff used to compute the pipeline state hash
2. **Risk scorer**: Skip the risk scorer invocation entirely when the only changed files are in `docs/`, `.risk-reports/`, or `.changeset/`
3. **Gate scripts**: Add a "docs-only" fast path that bypasses scoring and drift detection

## Related

- `.claude/hooks/risk-score-commit-gate.sh` — commit gate with drift detection
- `.claude/hooks/git-push-gate.sh` — push/release gate
- `.claude/hooks/lib/risk-gate.sh` — shared gate logic
- P001 — Risk scorer not writing gate scores (related gate issues)
- P002 — Risk gate score bypass (related gate architecture)
