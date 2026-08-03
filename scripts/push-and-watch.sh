#!/bin/bash
# Usage: npm run push:watch
# Pushes to origin, watches the Release workflow's build-and-test job, and
# reports results. If a release PR exists or is created, shows its URL.
#
# Risk gate: this script is gated by the PLUGIN-OWNED wr-risk-scorer
# git-push-gate hook (NOT a repo-local .claude/hooks/ script — that directory
# does not exist), which checks the push risk score before allowing execution.
# If the score is above appetite, the command is blocked.

set -euo pipefail

REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
BRANCH=$(git rev-parse --abbrev-ref HEAD)

# ── Helper: show failed jobs and guidance ─────────────────────────────────────
show_failure_guidance() {
  local run_id="$1"
  local run_url="$2"

  echo ""
  echo "Failed checks:"
  gh run view "$run_id" --json jobs \
    --jq '.jobs[] | select(.conclusion == "failure") | "  \u2717 \(.name)"' 2>/dev/null || true

  echo ""
  echo "Fix the failure above, then re-run: npm run push:watch"
  echo ""
  echo "CLAUDE: The push pipeline failed. Show the user which checks failed above,"
  echo "help them fix the issue, then run \`npm run push:watch\` again."
}

# ── 1. Push ─────────────────────────────────────────────────────────────────
echo "Pushing to origin ${BRANCH}..."
git push origin HEAD "$@"
echo ""

# ── 2. Wait for Release workflow to start ───────────────────────────────────
printf 'Waiting for Release workflow'
RUN_ID=""
for i in $(seq 1 40); do
  RUN_ID=$(gh run list \
    --workflow=release.yml \
    --branch "$BRANCH" \
    --limit 5 \
    --json databaseId,status,createdAt \
    --jq '[.[] | select(.status != "completed")] | sort_by(.createdAt) | reverse | .[0].databaseId' 2>/dev/null)
  [ -n "$RUN_ID" ] && [ "$RUN_ID" != "null" ] && break
  printf '.'
  sleep 3
done
echo ""

if [ -z "$RUN_ID" ] || [ "$RUN_ID" = "null" ]; then
  echo "No in-progress Release workflow found after push." >&2
  echo "The push may not have triggered the workflow. Check GitHub Actions manually." >&2
  exit 1
fi

RUN_URL="https://github.com/$REPO/actions/runs/$RUN_ID"
echo "Release workflow: $RUN_URL"
echo ""

# ── 3. Watch the workflow ───────────────────────────────────────────────────
# `--exit-status` is load-bearing, and the old `|| true` that discarded it was
# one of the three defects in P085. Capture rather than discard: a non-zero here
# is a real signal, but the job scan below is the authoritative check, so do not
# exit on it alone.
gh run watch "$RUN_ID" --exit-status && WATCH_STATUS=0 || WATCH_STATUS=$?

# ── 4. Verify EVERY job, job-agnostically (P085) ───────────────────────────
# This block replaces three compounding defects that made the script report
# "completed successfully" on a red master, which is how a Babel 8 regression
# sat on master unnoticed on 2026-08-03:
#
#   1. It selected a job named "build". No such job exists, so that guard could
#      never fire.
#   2. It selected the exact name "build-and-test", but a matrix names its jobs
#      "build-and-test (2.19.5)" and "build-and-test (3.5.0)", matching neither.
#   3. It tested only for the literal "failure". When build-and-test fails,
#      `release` never runs and its conclusion is "skipped" — so the one
#      selector that did match a real job returned a value the guard ignored.
#
# The fix is to allow-list nothing. Enumerate every job and treat anything that
# is not `success` or `skipped` as a failure. That way a job added later — like
# `engine-floor`, added the same day and already outside every old selector — is
# covered by default rather than needing this script edited again.
#
# `check-deps` is advisory per ADR 015 (`continue-on-error: true`), so it is the
# one deliberate exemption. Keep that list as short as this.
JOBS_TSV=$(gh run view "$RUN_ID" --json jobs \
  --jq '.jobs[] | "\(.conclusion // "pending")\t\(.name)"' 2>/dev/null)

# No jobs is not "nothing failed" — it means the scan learned nothing, and a
# scan that learned nothing must not report success. Without this, an empty
# jobs array feeds awk one blank line, matches no rule, and falls through to
# the green path. That is the same shape as the defects above: silence read
# as a pass.
if [ -z "$JOBS_TSV" ]; then
  echo ""
  echo "Push pipeline status UNKNOWN — $RUN_URL"
  echo "gh returned no jobs for this run, so nothing could be verified."
  exit 1
fi

BAD_JOBS=$(printf '%s\n' "$JOBS_TSV" | awk -F'\t' '
  $2 == "check-deps" { next }
  $1 == "success" || $1 == "skipped" { next }
  { print }
')

if [ -n "$BAD_JOBS" ]; then
  echo ""
  echo "Push pipeline failed — $RUN_URL"
  echo "Jobs that did not succeed:"
  printf '%s\n' "$BAD_JOBS" | sed 's/^/  /'
  show_failure_guidance "$RUN_ID" "$RUN_URL"
  exit 1
fi

if [ "${WATCH_STATUS:-0}" -ne 0 ]; then
  echo ""
  echo "Push pipeline failed — $RUN_URL"
  echo "gh run watch exited ${WATCH_STATUS} but every job scanned as success or skipped."
  echo "Treating the run as failed: the watcher saw something the job scan did not."
  show_failure_guidance "$RUN_ID" "$RUN_URL"
  exit 1
fi

# ── 5. Report results ──────────────────────────────────────────────────────
# Print every job rather than two hand-picked ones, so the report cannot go
# quiet about a job it was never taught to look for.
echo ""
echo "Push pipeline completed successfully."
printf '%s\n' "$JOBS_TSV" | awk -F'\t' '{ printf "  %-12s %s\n", $1, $2 }'
echo ""

# ── 5. Check for release PR ────────────────────────────────────────────────
PR_JSON=$(gh pr list --base master --state open --search "chore: release in:title" --limit 1 --json number,url,title 2>/dev/null)
PR_URL=$(echo "$PR_JSON" | jq -r '.[0].url // empty')
PR_TITLE=$(echo "$PR_JSON" | jq -r '.[0].title // empty')

if [ -n "$PR_URL" ]; then
  echo "Release PR available: $PR_TITLE"
  echo "  $PR_URL"
  echo ""
  echo "When ready to release, run: npm run release:watch"
else
  echo "No release PR found. There may be no pending changesets."
fi

echo ""
echo "CLAUDE: The push pipeline completed. Report the results above to the user."
