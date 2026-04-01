#!/bin/bash
# Usage: npm run release:watch
# Merges the open changesets release PR, watches the Release workflow, and
# reports publish + deploy status. On failure: shows what failed and prompts
# for a fix.
#
# Risk gate: This script is gated by .claude/hooks/git-push-gate.sh which
# checks the release risk score before allowing execution. If the score is
# >= 5 (Medium), the command is blocked.

set -euo pipefail

REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)

# ── Helper: show failed jobs and guidance ─────────────────────────────────────
show_failure_guidance() {
  local run_id="$1"
  local run_url="$2"

  echo ""
  echo "Failed checks:"
  gh run view "$run_id" --json jobs \
    --jq '.jobs[] | select(.conclusion == "failure") | "  \u2717 \(.name)"' 2>/dev/null || true

  echo ""
  echo "Fix the failure above, then re-run: npm run release:watch"
  echo ""
  echo "CLAUDE: The release pipeline failed. Show the user which checks failed above,"
  echo "help them fix the issue, then run \`npm run release:watch\` again."
}

# ── 1. Find the open changesets release PR ───────────────────────────────────
PR_JSON=$(gh pr list --base master --state open --search "chore: release in:title" --limit 1 --json number,url,title 2>/dev/null)
PR_NUMBER=$(echo "$PR_JSON" | jq -r '.[0].number // empty')
PR_URL=$(echo "$PR_JSON" | jq -r '.[0].url // empty')
PR_TITLE=$(echo "$PR_JSON" | jq -r '.[0].title // empty')

if [ -z "$PR_NUMBER" ]; then
  echo "No open release PR found (expected title: 'chore: release', base: master)." >&2
  echo "Has it already been merged, or are there no pending changesets?" >&2
  exit 1
fi

echo "Found release PR #$PR_NUMBER: $PR_TITLE"
echo "  $PR_URL"
echo ""

# ── 2. Check CI status on the PR ────────────────────────────────────────────
echo "Checking CI status..."
# Wait for the build check (the one that runs tests). check-deps is advisory
# per ADR 015 and may fail when mature updates are available.
# Note: The changeset release PR may not have CI checks if the branch was
# pushed by GITHUB_TOKEN (which doesn't trigger workflows). In that case,
# we proceed — the release workflow itself runs tests before publishing.
echo "Waiting for build check to complete..."
BUILD_STATUS=""
for i in $(seq 1 30); do
  BUILD_STATUS=$(gh pr checks "$PR_NUMBER" --json name,state --jq '.[] | select(.name == "build") | .state' 2>/dev/null)
  case "$BUILD_STATUS" in
    SUCCESS)
      echo "Build check passed."
      break
      ;;
    FAILURE|ERROR)
      echo "Build check failed on the release PR. Fix CI first." >&2
      gh pr checks "$PR_NUMBER" 2>/dev/null
      exit 1
      ;;
    "")
      # No build check found — changeset PR pushed by GITHUB_TOKEN won't trigger CI.
      # Safe to proceed: the post-merge release workflow runs tests before publishing.
      if [ "$i" -ge 6 ]; then
        echo ""
        echo "No build check found on PR (expected for changeset PRs). Proceeding."
        BUILD_STATUS="SKIPPED"
        break
      fi
      printf '.'
      sleep 10
      ;;
    *)
      printf '.'
      sleep 10
      ;;
  esac
done
if [ "$BUILD_STATUS" != "SUCCESS" ] && [ "$BUILD_STATUS" != "SKIPPED" ]; then
  echo ""
  echo "Build check did not complete within 5 minutes." >&2
  exit 1
fi
echo ""

# ── 3. Merge the release PR ─────────────────────────────────────────────────
echo "Merging release PR #$PR_NUMBER..."
gh pr merge "$PR_NUMBER" --merge
echo ""

# ── 4. Find the triggered Release workflow run ──────────────────────────────
printf 'Waiting for Release workflow'
RUN_ID=""
for i in $(seq 1 40); do
  RUN_ID=$(gh run list \
    --workflow=release.yml \
    --branch master \
    --limit 5 \
    --json databaseId,status,createdAt \
    --jq '[.[] | select(.status != "completed")] | sort_by(.createdAt) | reverse | .[0].databaseId' 2>/dev/null)
  [ -n "$RUN_ID" ] && [ "$RUN_ID" != "null" ] && break
  printf '.'
  sleep 3
done
echo ""

if [ -z "$RUN_ID" ] || [ "$RUN_ID" = "null" ]; then
  echo "No in-progress Release workflow found." >&2
  echo "The merge may not have triggered the workflow. Check GitHub Actions manually." >&2
  exit 1
fi

RUN_URL="https://github.com/$REPO/actions/runs/$RUN_ID"
echo "Release workflow: $RUN_URL"
echo ""

# ── 5. Watch the workflow ────────────────────────────────────────────────────
if ! gh run watch "$RUN_ID" --exit-status; then
  echo ""
  echo "Release failed — $RUN_URL"
  show_failure_guidance "$RUN_ID" "$RUN_URL"
  exit 1
fi

# ── 6. Report results ───────────────────────────────────────────────────────
# Check if the release job published (changesets.outputs.published == 'true')
RELEASE_JOB=$(gh run view "$RUN_ID" --json jobs \
  --jq '.jobs[] | select(.name == "release") | .conclusion' 2>/dev/null || echo "unknown")

DEPLOY_JOB=$(gh run view "$RUN_ID" --json jobs \
  --jq '.jobs[] | select(.name | contains("Deploy")) | .conclusion' 2>/dev/null || echo "skipped")

echo ""
echo "Release workflow completed successfully."
echo "  Release job: $RELEASE_JOB"
echo "  Deploy job: ${DEPLOY_JOB:-skipped (no new version published)}"
echo ""

# ── 7. Run post-release hooks ───────────────────────────────────────────────
HOOK_DIR="scripts/post-release.d"
if [ -d "$HOOK_DIR" ]; then
  PREV_MERGE=$(git log --grep='chore: release' -1 --format=%H HEAD~1 2>/dev/null || true)
  if [ -n "$PREV_MERGE" ]; then
    CHANGED_FILES=$(git diff --name-only "$PREV_MERGE"..HEAD~1 2>/dev/null || true)
  else
    CHANGED_FILES=""
  fi

  for hook in "$HOOK_DIR"/*; do
    [ -x "$hook" ] || continue
    echo "Running post-release hook: $(basename "$hook")"
    if ! echo "$CHANGED_FILES" | RELEASE_DATE="$(date +%Y-%m-%d)" "$hook"; then
      echo "Warning: post-release hook $(basename "$hook") failed (non-fatal)"
    fi
  done

  if ! git diff --quiet || ! git diff --cached --quiet; then
    VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")
    git add -A
    git commit -m "chore: post-release updates for v$VERSION [skip ci]"
    git pull --rebase origin master
    git push
    echo "Post-release hook changes committed and pushed."
  fi
fi

echo ""
echo "CLAUDE: The release workflow completed. Report the results above to the user."
if [ "$DEPLOY_JOB" = "success" ]; then
  echo "The new version has been published to npm and deployed to AWS."
else
  echo "The release job ran but no deploy was triggered (changesets may not have published a new version)."
fi
