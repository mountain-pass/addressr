#!/bin/bash
# @jtbd JTBD-400 (Ship Releases Reliably From Trunk)
#
# Usage: npm run release:watch
#
# Merges the open changesets release PR, watches the Release workflow, and
# reports publish + deploy status. On failure: shows what failed and prompts for
# a fix.
#
# THE --deploy-only FLAG IS GONE (2026-08-10, ADR-045). It dispatched
# release.yml with deploy_only=true to deploy the current published version
# without publishing. That entry point is superseded: an infrastructure change
# now reaches production by carrying a changeset for `apps/addressr-deployment`,
# and merging the release PR — this script's ONLY path — is the apply. So an
# infra-only release is not a different command any more; it is an ordinary
# release whose changeset happens to name the deployment package.
#
# Risk gate: this script is gated by the PLUGIN-OWNED wr-risk-scorer
# git-push-gate hook (NOT a repo-local .claude/hooks/ script — that directory
# does not exist), which checks the release risk score before allowing
# execution. If the score is above appetite, the command is blocked.
#
# The gate matches on the `npm run release:watch` command PREFIX. That is why
# there is no `scripts/deploy-watch.sh` and why `npm run deploy:watch` refuses
# rather than aliasing: npm spawns the inner command in a child shell the hook
# never sees, so an alias would reach prod UNGATED. This mattered more when a
# --deploy-only flag existed; it still holds, because ANY second entry point
# added here would need to keep the same prefix.

set -euo pipefail

# Resolve this script's own directory so the job scan loads from lib/ regardless
# of the caller's cwd. `npm run` sets cwd to the package root, but the scripts
# are also run directly; BASH_SOURCE is the only thing true in both cases.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"


# Refuse the retired flag loudly rather than ignoring it. Silently accepting
# `--deploy-only` and running an ordinary release is the worst outcome: the
# operator asked for a publish-free deploy and would get a publish.
if [ "${1:-}" = "--deploy-only" ]; then
  echo "release:watch: --deploy-only is retired (ADR-045)." >&2
  echo "Arm an infrastructure deploy by committing a changeset for apps/addressr-deployment;" >&2
  echo "merging the release PR is the apply. Then run: npm run release:watch" >&2
  exit 1
fi

REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)

# ── Helper: show failed jobs and guidance ─────────────────────────────────────
show_failure_guidance() {
  local run_id="$1"
  local run_url="$2"

  echo ""
  echo "Failed checks:"
  # Must use the SAME default-deny predicate as the scan that called us. It
  # previously selected only `conclusion == "failure"`, so a cancelled or
  # timed_out job would fail the scan and then print nothing here \u2014 the operator
  # gets told the release failed and shown an empty list.
  gh run view "$run_id" --json jobs \
    --jq '.jobs[] | select((.conclusion // "pending") != "success" and (.conclusion // "pending") != "skipped") | "  \u2717 \(.conclusion // "pending")  \(.name)"' 2>/dev/null || true

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
# P085 sibling fix. This loop used to select `.name == "build"`, and release.yml
# has no job by that name — the jobs are check-deps, engine-floor,
# build-and-test (<engine>) and release. So the selector matched nothing on
# EVERY run, the empty case was taken every time, and after ~60s the script
# announced "No build check found (expected for changeset PRs)" and proceeded.
# The "expected for changeset PRs" rationale is sometimes true, but the broken
# selector meant that branch was taken unconditionally, so a genuinely red
# release PR was never caught here. The wait was theatre.
#
# Same fix shape as scripts/push-and-watch.sh: allow-list nothing. Read every
# check, fail on any that concluded badly, and only treat "no checks" as
# proceed-worthy when the list is genuinely empty rather than when a selector
# missed.
echo "Waiting for release PR checks to complete..."
BUILD_STATUS=""
for i in $(seq 1 30); do
  CHECKS_TSV=$(gh pr checks "$PR_NUMBER" --json name,state \
    --jq '.[] | "\(.state)\t\(.name)"' 2>/dev/null || true)

  if [ -z "$CHECKS_TSV" ]; then
    # Genuinely no checks. A changeset PR pushed by GITHUB_TOKEN does not
    # trigger workflows, and the post-merge release workflow runs the tests
    # before publishing, so proceeding is safe here.
    if [ "$i" -ge 6 ]; then
      echo ""
      echo "No checks found on the release PR (expected when GITHUB_TOKEN opened it). Proceeding."
      BUILD_STATUS="SKIPPED"
      break
    fi
    printf '.'
    sleep 10
    continue
  fi

  BAD_CHECKS=$(printf '%s\n' "$CHECKS_TSV" | awk -F'\t' '
    $2 == "check-deps" { next }
    $1 == "FAILURE" || $1 == "ERROR" || $1 == "CANCELLED" || $1 == "TIMED_OUT" || $1 == "ACTION_REQUIRED" || $1 == "STARTUP_FAILURE" { print }
  ')
  if [ -n "$BAD_CHECKS" ]; then
    echo ""
    echo "Release PR checks did not pass. Fix CI first." >&2
    printf '%s\n' "$BAD_CHECKS" | sed 's/^/  /' >&2
    exit 1
  fi

  PENDING_CHECKS=$(printf '%s\n' "$CHECKS_TSV" | awk -F'\t' '
    $2 == "check-deps" { next }
    $1 == "SUCCESS" || $1 == "SKIPPED" || $1 == "NEUTRAL" { next }
    { print }
  ')
  if [ -z "$PENDING_CHECKS" ]; then
    echo ""
    echo "Release PR checks passed:"
    printf '%s\n' "$CHECKS_TSV" | awk -F'\t' '{ printf "  %-16s %s\n", $1, $2 }'
    BUILD_STATUS="SUCCESS"
    break
  fi

  printf '.'
  sleep 10
done

if [ "$BUILD_STATUS" != "SUCCESS" ] && [ "$BUILD_STATUS" != "SKIPPED" ]; then
  echo ""
  echo "Release PR checks did not reach a terminal state in time. Not merging." >&2
  gh pr checks "$PR_NUMBER" 2>/dev/null || true
  exit 1
fi
echo ""

# ── 3. Merge the release PR ─────────────────────────────────────────────────
echo "Merging release PR #$PR_NUMBER..."
gh pr merge "$PR_NUMBER" --merge
echo ""

# ── 4. Find the triggered Release workflow run ──────────────────────────────
# One entry point again, so no event filter is needed. It carried
# `--event workflow_dispatch` while the deploy-only dispatch existed, because
# two kinds of run on master meant this loop could latch onto whichever was in
# flight. Kept as an empty string rather than deleted so the `gh run list`
# invocation below is unchanged and a future second entry point has somewhere
# obvious to re-point.
#
# Deliberately a string, not an array: under `set -u`, bash 3.2 (still the
# system bash on macOS) errors on "${arr[@]}" when the array is empty.
RUN_EVENT_FILTER=""
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
# `--exit-status` and capture, not `|| true`. Discarding this was one of the
# defects P085 records on the push-path sibling. The job scan below is
# authoritative, so do not exit on the watch status alone — but do not throw it
# away either.
gh run watch "$RUN_ID" --exit-status && WATCH_STATUS=0 || WATCH_STATUS=$?
# `gh run watch` is not guaranteed to have blocked to completion — a transient
# can make it return early, and its exit status is deliberately non-fatal above.
# The job scan below is default-deny, so it reads every unfinished job as a
# failure: scanning an in-progress run reports a GREEN run as red. That happened
# on run 30973114823 (2026-08-05), P085's fifth defect. Assert completion first.
# Do NOT weaken the scan to tolerate `pending` — the default-deny IS the P085
# remediation; the missing precondition is the bug.
#
# Also capture the run-level `conclusion`. It is a verdict the job scan has never
# read, and it strictly dominates the watcher's exit code as a second opinion:
# a run whose own conclusion is `failure` while every job reads success/skipped
# passed this script until now.
#
# Deadline: 60m is DERIVED, not picked. The release path bounds are in deploy/main.tf: the
# ASG rolling-update Timeout is PT30M (:604-606, named in ADR 004) and the EB
# command Timeout is 600s (:610-612), plus release.yml's 120s stabilise sleep,
# plus prod smoke and docker-publish. A config change that triggers instance
# replacement legitimately consumes the full PT30M, so a 30m deadline would sit
# INSIDE the run's own worst case and manufacture a false red — after npm
# publish and the prod deploy have already gone out.
wait_for_completion() {
  local deadline=$(( SECONDS + 60 * 60 ))
  local json
  while [ "$SECONDS" -lt "$deadline" ]; do
    json=$(gh run view "$RUN_ID" --json status,conclusion 2>/dev/null) || json=""
    RUN_STATUS=$(printf '%s' "$json" | jq -r '.status // ""' 2>/dev/null)
    RUN_CONCLUSION=$(printf '%s' "$json" | jq -r '.conclusion // ""' 2>/dev/null)
    [ "$RUN_STATUS" = "completed" ] && return 0
    command sleep 10
  done
  echo ""
  # Inconclusive, not failed: the scan learned nothing about the run. Same
  # epistemic state as the empty-job-list branch below, so the same exit.
  echo "Release status UNKNOWN — run did not reach 'completed' within 60m (last status: ${RUN_STATUS:-unknown})."
  echo "Not scanning an unfinished run — check $RUN_URL"
  return 1
}
RUN_STATUS=""
RUN_CONCLUSION=""
wait_for_completion || exit 1


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
# P085 sibling fix. The whole-job-set check above was right in principle, but it
# selected only `conclusion == "failure"`, so `cancelled`, `timed_out`,
# `startup_failure`, `neutral` and `action_required` all fell through to the
# green path — and so did an empty jobs array. Allow-list nothing instead:
# anything that is not `success` or `skipped` fails. That also covers a job
# added to release.yml later without this script being edited.
JOBS_TSV=$(gh run view "$RUN_ID" --json jobs \
  --jq '.jobs[] | "\(.conclusion // "pending")\t\(.name)"' 2>/dev/null)

# No jobs is not "nothing failed" — it means the scan learned nothing, and this
# runs AFTER npm publish and the prod deploy, so silence is the worst possible
# thing to read as success.
if [ -z "$JOBS_TSV" ]; then
  echo ""
  echo "Release status UNKNOWN — $RUN_URL"
  echo "gh returned no jobs for this run, so nothing could be verified."
  echo "Check the run directly before assuming the release completed."
  exit 1
fi

# THE `&& ... || ...` IS LOAD-BEARING, and this file documents why ~100 lines
# below (search "an assignment IS a simple command"). scan-jobs.awk encodes its
# verdict in the EXIT CODE — 0 green, 1 a job did not succeed, 2 nothing scanned
# — so a bare `VAR=$(... | awk ...)` under `set -euo pipefail` takes awk's
# status and terminates the script AT THE ASSIGNMENT, making every diagnostic
# below unreachable. That defect shipped in this file for one commit on
# 2026-08-19: the extraction turned a loud failure into a silent exit 1, on the
# release path, after the publish and the apply. Verified by running it, not by
# reading it. Do not "tidy" this back into an assignment.
FAILED_JOBS=$(printf '%s\n' "$JOBS_TSV" | awk -F'\t' -f "$SCRIPT_DIR/lib/scan-jobs.awk") && SCAN_STATUS=0 || SCAN_STATUS=$?
# BRANCH ON THE STATUS, not on whether stdout happened to be non-empty. The
# scan reports three states and they are epistemically different: 1 is "the run
# is bad", 2 is "I could not find out". Testing emptiness collapses 2 into the
# success path — the empty-scan defect this ticket already fixed once, reachable
# again by a different route the moment the caller stops reading the code.
#
# BE ACCURATE ABOUT exit 2: the `[ -z "$JOBS_TSV" ]` guard above already exits
# on an empty scan, so 2 is UNREACHABLE from here today. This branch is
# defence-in-depth for the day that guard is refactored away, not a live path —
# claiming otherwise would be the same overstatement this ticket keeps
# recording.
if [ "$SCAN_STATUS" -eq 2 ]; then
  echo ""
  echo "Release status UNKNOWN — $RUN_URL"
  echo "The job scan returned nothing, so nothing could be verified."
  exit 1
fi

if [ "$SCAN_STATUS" -ne 0 ] || [ -n "$FAILED_JOBS" ]; then
  echo ""
  echo "Release failed — $RUN_URL"
  echo "Jobs that did not succeed:"
  printf '%s\n' "$FAILED_JOBS" | sed 's/^/  /'
  show_failure_guidance "$RUN_ID" "$RUN_URL"
  exit 1
fi

# The run's own conclusion is the verdict; check it before anything else. A run
# concluding non-success while every job reads success/skipped passed until now.
if [ -n "$RUN_CONCLUSION" ] && [ "$RUN_CONCLUSION" != "success" ]; then
  echo ""
  echo "Release failed — $RUN_URL"
  echo "Run conclusion is '$RUN_CONCLUSION' even though every job scanned as success or skipped."
  show_failure_guidance "$RUN_ID" "$RUN_URL"
  exit 1
fi

if [ "${WATCH_STATUS:-0}" -ne 0 ]; then
  if [ "$RUN_CONCLUSION" = "success" ]; then
    # P085 fifth defect: a transient that ends `gh run watch` early exits non-zero
    # AND drops into the scan. The precondition fixed the scan half; this is the
    # other half. The watcher's exit code was a proxy for the run's verdict and we
    # now have the verdict itself, so a clean scan plus a `success` conclusion
    # outranks it. Warn — do not fail a green run.
    echo ""
    echo "Note: gh run watch exited ${WATCH_STATUS} (likely a transient), but the run"
    echo "concluded 'success' and every job scanned clean. Treating the run as green."
  else
    echo ""
    echo "Release failed — $RUN_URL"
    echo "gh run watch exited ${WATCH_STATUS} and the run conclusion is unavailable."
    echo "Treating the release as failed: the watcher saw something the job scan did not."
    show_failure_guidance "$RUN_ID" "$RUN_URL"
    exit 1
  fi
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

# RE-POINTED 2026-08-10 onto the changesets-armed axis, NOT deleted. This is the
# only thing catching the silent-green class on this path: a release that was
# supposed to apply infrastructure, went fully green, and applied nothing.
#
# It used to fire on a deploy-only dispatch whose Deploy step did not succeed —
# the symptom of a mis-typed `deploy_only` predicate. That input is retired, so
# the question becomes: did THIS merge bump the deployment package's version? If
# it did, Deploy must have succeeded.
#
# The predicate is the SAME SCRIPT the workflow gate uses, deliberately. Two
# implementations of "did this arm a deploy" would drift, and the drift would be
# invisible until an apply silently did not happen.
# EVERY FAILURE PATH HERE IS LOUD, and that is the point. This is the one control
# catching "a release that was supposed to apply infrastructure, went fully
# green, and applied nothing". A version of it that goes quiet when something
# breaks is inert exactly when it matters. An earlier draft swallowed a failed
# fetch and a failed detector into `changed=false` — the guard's PASS value —
# which is the same fail-open shape as the P044 assertion this repo already had
# to fix once.
if ! git fetch -q origin master 2>/dev/null; then
  echo "Could not fetch origin/master, so cannot tell whether this release should" >&2
  echo "have deployed. Deploy status was '${DEPLOY_STATUS:-unknown}'." >&2
  echo "Verify by hand: $RUN_URL" >&2
  exit 1
fi

MERGED=$(git rev-parse origin/master 2>/dev/null || true)
# `origin/master^` is the merge commit's FIRST parent, which is what
# github.event.before denotes — so this range matches the workflow's exactly.
MERGED_PARENT=$(git rev-parse "origin/master^" 2>/dev/null || true)
if [ -z "$MERGED" ] || [ -z "$MERGED_PARENT" ]; then
  echo "Could not resolve origin/master and its first parent, so cannot tell whether" >&2
  echo "this release should have deployed. Verify by hand: $RUN_URL" >&2
  exit 1
fi

# origin/master explicitly as the head ref: the local HEAD has not been pulled
# yet at this point (step 8 does that), so letting it default would compare
# against a commit that predates the merge.
#
# Status captured SEPARATELY from stdout. The detector is designed never to exit
# non-zero (pinned in its own test), so a non-zero exit is unambiguously "the
# detector broke" — collapsing that into `changed=false` would report the
# guard's pass value on a broken guard.
# `&& ... || ...` rather than a bare assignment, and it is load-bearing under
# `set -e`. An assignment IS a simple command, so a non-zero command
# substitution trips `set -e` immediately — the status capture and the
# diagnostic below would be UNREACHABLE, and the script would exit with a bare
# non-zero code at the worst possible moment (after the publish and the apply).
# Fail-closed, but mute, which is not what the header above claims. This is the
# same idiom this script already uses for `gh run watch`. The detector's own
# stderr is deliberately NOT discarded here: it names the reason.
ARMED=$(scripts/detect-deployment-bump.sh "$MERGED_PARENT" "$MERGED") && DETECT_STATUS=0 || DETECT_STATUS=$?
if [ "$DETECT_STATUS" -ne 0 ]; then
  echo "The deployment-bump detector exited ${DETECT_STATUS}; it is designed never to." >&2
  echo "Cannot tell whether this release should have deployed. Verify by hand: $RUN_URL" >&2
  exit 1
fi

if [ "$ARMED" = "changed=true" ] && [ "$DEPLOY_STATUS" != "success" ]; then
  echo "This release bumped the deployment package but did NOT deploy." >&2
  echo "Deploy step conclusion was '${DEPLOY_STATUS:-unknown}', expected 'success'." >&2
  echo "That is a green run that applied no infrastructure — check the deploy gate" >&2
  echo "in .github/workflows/release.yml against ADR-045." >&2
  echo "  $RUN_URL" >&2
  exit 1
fi

# ── 7. Run post-release hooks ───────────────────────────────────────────────
# The `$DEPLOY_ONLY = 0` conjunct is GONE because its subject is: the deploy-only
# dispatch is retired, and every run reaching here came through the release PR.
# The reason it existed still matters and is recorded rather than dropped — the
# hooks' PREV_MERGE derivation walks 'chore: release' commits, so on a run that
# created none it would diff and potentially commit unrelated content. These
# hooks `git add -A`, commit and PUSH TO MASTER, so that was not a cosmetic
# guard. Every surviving path does create a release commit, which is what makes
# removing the conjunct safe rather than merely tidy.
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
if [ "$DEPLOY_STATUS" = "success" ]; then
  echo "The new version has been published to npm and deployed to AWS."
elif [ "$DEPLOY_STATUS" = "skipped" ]; then
  echo "No new version published (no actionable changesets). The release job completed but no deploy occurred."
else
  echo "Deploy step status: ${DEPLOY_STATUS:-unknown} — check the workflow logs."
fi
