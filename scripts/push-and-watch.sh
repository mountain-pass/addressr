#!/bin/bash
# Usage: npm run push:watch
# Pushes to origin, watches the Release workflow's build-and-test job, and
# reports results. If a release PR exists or is created, shows its URL.
#
# Risk gate: This script is gated by .claude/hooks/git-push-gate.sh which
# checks the push risk score before allowing execution. If the score is
# >= 5 (Medium), the command is blocked.

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
gh run watch "$RUN_ID" || true

# Check the release job specifically (check-deps is advisory per ADR 015)
RELEASE_CONCLUSION=$(gh run view "$RUN_ID" --json jobs --jq '.jobs[] | select(.name == "release") | .conclusion' 2>/dev/null)
BUILD_CONCLUSION=$(gh run view "$RUN_ID" --json jobs --jq '.jobs[] | select(.name == "build") | .conclusion' 2>/dev/null)
if [ "$RELEASE_CONCLUSION" = "failure" ] || [ "$BUILD_CONCLUSION" = "failure" ]; then
  echo ""
  echo "Push pipeline failed — $RUN_URL"
  show_failure_guidance "$RUN_ID" "$RUN_URL"
  exit 1
fi

# ── 4. Report results ──────────────────────────────────────────────────────
BUILD_JOB=$(gh run view "$RUN_ID" --json jobs \
  --jq '.jobs[] | select(.name == "build-and-test") | .conclusion' 2>/dev/null || echo "unknown")

RELEASE_JOB=$(gh run view "$RUN_ID" --json jobs \
  --jq '.jobs[] | select(.name == "release") | .conclusion' 2>/dev/null || echo "skipped")

echo ""
echo "Push pipeline completed successfully."
echo "  Build and test: $BUILD_JOB"
echo "  Release job: ${RELEASE_JOB:-skipped (not on master)}"
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
