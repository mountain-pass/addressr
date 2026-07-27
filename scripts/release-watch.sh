#!/bin/bash
# @jtbd JTBD-400 (Ship Releases Reliably From Trunk)
#
# Usage: npm run release:watch
#        npm run release:watch -- --deploy-only
#
# Default: merges the open changesets release PR, watches the Release workflow,
# and reports publish + deploy status. On failure: shows what failed and prompts
# for a fix.
#
# --deploy-only (P039 / ADR 001 amendment 2026-07-26): deploys the CURRENT
# published version to prod without publishing anything. Dispatches release.yml
# with deploy_only=true and watches the same run. Use for EB env-var and
# Terraform-only changes that previously needed a no-op changeset and a churned
# public npm version.
#
# Risk gate: this script is gated by the PLUGIN-OWNED wr-risk-scorer
# git-push-gate hook (NOT a repo-local .claude/hooks/ script — that directory
# does not exist), which checks the release risk score before allowing
# execution. If the score is above appetite, the command is blocked.
#
# The gate matches on the `npm run release:watch` command PREFIX, so the
# --deploy-only form is gated by construction — which is exactly why the
# deploy-only path lives here as a flag rather than in a separate
# scripts/deploy-watch.sh. A `npm run deploy:watch` alias would reach prod
# UNGATED: npm spawns the inner command in a child shell the hook never sees.

set -euo pipefail

DEPLOY_ONLY=0
if [ "${1:-}" = "--deploy-only" ]; then
  DEPLOY_ONLY=1
fi

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

if [ "$DEPLOY_ONLY" = "1" ]; then

# ── 1-3 (deploy-only). No PR to find, approve, check or merge — dispatch. ────
# The workflow's `release` job is guarded on refs/heads/master, so --ref master
# is required, not merely conventional. build-and-test is an unconditional
# `needs:`, so the full OpenSearch matrix still runs before anything deploys.
echo "Dispatching deploy-only run of release.yml (no npm publish)..."
gh workflow run release.yml --ref master -f deploy_only=true
echo ""

else

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

# ── 1b. Approve gated release-PR CI runs (P051) ─────────────────────────────
# The repo's first-time-contributor approval policy gates github-actions[bot]-
# triggered runs at conclusion=action_required, so the release PR's build check
# never starts and step 2 below times out. Auto-approve ONLY runs bound to this
# PR's exact head commit, leaving the repo-wide gate untouched for all other PRs.
HEAD_SHA=$(gh pr view "$PR_NUMBER" --json headRefOid -q .headRefOid 2>/dev/null)
HEAD_BRANCH=$(gh pr view "$PR_NUMBER" --json headRefName -q .headRefName 2>/dev/null)
if [ -n "$HEAD_SHA" ] && [ -n "$HEAD_BRANCH" ]; then
  GATED_RUNS=$(gh api "repos/$REPO/actions/runs?branch=$HEAD_BRANCH&event=pull_request" \
    --jq ".workflow_runs[] | select(.head_sha == \"$HEAD_SHA\" and .conclusion == \"action_required\") | .id" 2>/dev/null || true)
  for run_id in $GATED_RUNS; do
    echo "Approving gated release-PR run $run_id (action_required)..."
    if gh api -X POST "repos/$REPO/actions/runs/$run_id/approve" >/dev/null 2>&1; then
      echo "  Approved: https://github.com/$REPO/actions/runs/$run_id"
    else
      echo "Failed to approve run $run_id." >&2
      echo "Approve it manually, then re-run: gh api -X POST repos/$REPO/actions/runs/$run_id/approve" >&2
      exit 1
    fi
  done
fi

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

fi

# ── 4. Find the triggered Release workflow run ──────────────────────────────
# With two entry points there are now two kinds of run on master, so filter by
# event — otherwise this loop can latch onto whichever run is in flight.
# Deliberately a string, not an array: under `set -u`, bash 3.2 (still the
# system bash on macOS) errors on "${arr[@]}" when the array is empty. These
# two tokens contain no whitespace or globs, so word splitting is safe.
RUN_EVENT_FILTER=""
if [ "$DEPLOY_ONLY" = "1" ]; then
  RUN_EVENT_FILTER="--event workflow_dispatch"
fi
printf 'Waiting for Release workflow'
RUN_ID=""
for i in $(seq 1 40); do
  RUN_ID=$(gh run list \
    --workflow=release.yml \
    --branch master \
    $RUN_EVENT_FILTER \
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
gh run watch "$RUN_ID" || true

# Fail on ANY failed job, not just `release`. As of ADR-040 stage 3 release.yml
# is MULTI-JOB — `docker-publish` calls the docker-image reusable workflow — and
# `gh run watch` above has its exit code swallowed by `|| true`. Checking only
# the `release` job would therefore report "completed successfully" while the
# image publish was red, after npm publish and the prod deploy had already gone
# through. That is the P004 false-negative class on a new surface, so the check
# is written against the whole job set rather than a named job that has to be
# kept in sync with the workflow.
#
# check-deps stays excluded by name: it is advisory per ADR 015 and carries
# continue-on-error, so a red one must not fail the release.
FAILED_JOBS=$(gh run view "$RUN_ID" --json jobs \
  --jq '[.jobs[] | select(.conclusion == "failure") | select(.name != "check-deps") | .name] | join(", ")' 2>/dev/null)
if [ -n "$FAILED_JOBS" ]; then
  echo ""
  echo "Release failed — $RUN_URL"
  echo "  Failed jobs: $FAILED_JOBS"
  show_failure_guidance "$RUN_ID" "$RUN_URL"
  exit 1
fi

# ── 6. Report results ───────────────────────────────────────────────────────
# The Deploy and Smoke steps live INSIDE the `release` job and are gated on
# steps.changesets.outputs.published == 'true', so step-level conclusions are
# what distinguish "skipped (no publish)" from "success (actually shipped)".
# The workflow itself is no longer single-job — see the whole-job-set failure
# check above, which is what catches a red `docker-publish`.
RELEASE_JOB=$(gh run view "$RUN_ID" --json jobs \
  --jq '.jobs[] | select(.name == "release") | .conclusion' 2>/dev/null || echo "unknown")

# Deploy step status: success = publish + terraform apply, skipped = no changeset published
DEPLOY_STATUS=$(gh run view "$RUN_ID" --json jobs \
  --jq '.jobs[] | select(.name == "release") | .steps[] | select(.name == "Deploy new version") | .conclusion' 2>/dev/null || echo "")

echo ""
echo "Release workflow completed successfully."
echo "  Release job: $RELEASE_JOB"
case "$DEPLOY_STATUS" in
  success) echo "  Deploy step: success (Terraform applied, smoke test passed)";;
  skipped) echo "  Deploy step: skipped (no new version published by changesets)";;
  *)       echo "  Deploy step: ${DEPLOY_STATUS:-unknown}";;
esac
echo ""

# On a deploy-only run a skipped Deploy step is a FAILURE, not the benign
# "nothing to publish" outcome it means on the release path. It is the exact
# symptom of a mis-typed `deploy_only` predicate in release.yml (a quoted
# "true" comparison never matches a boolean input), which otherwise presents
# as a fully green run that deployed nothing. Fail loud.
if [ "$DEPLOY_ONLY" = "1" ] && [ "$DEPLOY_STATUS" != "success" ]; then
  echo "Deploy-only run did not deploy: Deploy step conclusion was '${DEPLOY_STATUS:-unknown}', expected 'success'." >&2
  echo "Check the deploy_only gate predicates in .github/workflows/release.yml (see P039)." >&2
  echo "  $RUN_URL" >&2
  exit 1
fi

# ── 7. Run post-release hooks ───────────────────────────────────────────────
# Skipped on the deploy-only path: nothing was published, and the hooks' own
# PREV_MERGE derivation walks 'chore: release' commits that this run did not
# create — it would diff and potentially commit unrelated content.
HOOK_DIR="scripts/post-release.d"
if [ "$DEPLOY_ONLY" = "0" ] && [ -d "$HOOK_DIR" ]; then
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
if [ "$DEPLOY_ONLY" = "1" ]; then
  echo "The currently published version has been deployed to AWS. Nothing was published to npm (P039 deploy-only)."
elif [ "$DEPLOY_STATUS" = "success" ]; then
  echo "The new version has been published to npm and deployed to AWS."
elif [ "$DEPLOY_STATUS" = "skipped" ]; then
  echo "No new version published (no actionable changesets). The release job completed but no deploy occurred."
else
  echo "Deploy step status: ${DEPLOY_STATUS:-unknown} — check the workflow logs."
fi
