#!/bin/bash
# Usage: npm run push:watch
# Pushes to origin, watches EVERY job in the Release workflow, and reports
# results. If a release PR exists or is created, shows its URL.
#
# Corrected 2026-08-24: this line said "watches the Release workflow's
# build-and-test job", which is the stale claim P085 removed from the body of
# this same file ~100 lines below. The scan is default-deny over all jobs via
# scripts/scan-jobs.awk, exempting only check-deps. A header describing a
# narrower reach than the code has is how the P085 selector defect survived.
#
# Risk gate: this script is gated by the PLUGIN-OWNED wr-risk-scorer
# git-push-gate hook (NOT a repo-local .claude/hooks/ script — that directory
# does not exist), which checks the push risk score before allowing execution.
# If the score is above appetite, the command is blocked.

set -euo pipefail

# Resolve this script's own directory so the job scan loads from lib/ regardless
# of the caller's cwd. `npm run` sets cwd to the package root, but the scripts
# are also run directly; BASH_SOURCE is the only thing true in both cases.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"


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
# Deadline: 30m is ~10x the observed build time (~3 min, two matrix legs in parallel).
wait_for_completion() {
  local deadline=$(( SECONDS + 30 * 60 ))
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
  echo "Push pipeline status UNKNOWN — run did not reach 'completed' within 30m (last status: ${RUN_STATUS:-unknown})."
  echo "Not scanning an unfinished run — check $RUN_URL"
  return 1
}
RUN_STATUS=""
RUN_CONCLUSION=""
wait_for_completion || exit 1


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

# THE `&& ... || ...` IS LOAD-BEARING. scripts/release-watch.sh documents why,
# at its deployment-bump detector (search there for "an assignment IS a simple
# command") — this comment is a copy of its sibling's and the cross-reference
# pointed at this file, where that text has never existed. scan-jobs.awk encodes its
# verdict in the EXIT CODE — 0 green, 1 a job did not succeed, 2 nothing scanned
# — so a bare `VAR=$(... | awk ...)` under `set -euo pipefail` takes awk's
# status and terminates the script AT THE ASSIGNMENT, making every diagnostic
# below unreachable. That defect shipped in this file for one commit on
# 2026-08-19: the extraction turned a loud failure into a silent exit 1, on the
# release path, after the publish and the apply. Verified by running it, not by
# reading it. Do not "tidy" this back into an assignment.
BAD_JOBS=$(printf '%s\n' "$JOBS_TSV" | awk -F'\t' -f "$SCRIPT_DIR/scan-jobs.awk") && SCAN_STATUS=0 || SCAN_STATUS=$?

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
  echo "Push pipeline status UNKNOWN — $RUN_URL"
  echo "The job scan returned nothing, so nothing could be verified."
  exit 1
fi

if [ "$SCAN_STATUS" -ne 0 ] || [ -n "$BAD_JOBS" ]; then
  echo ""
  echo "Push pipeline failed — $RUN_URL"
  echo "Jobs that did not succeed:"
  printf '%s\n' "$BAD_JOBS" | sed 's/^/  /'
  show_failure_guidance "$RUN_ID" "$RUN_URL"
  exit 1
fi

# The run's own conclusion is the verdict; check it before anything else. A run
# concluding non-success while every job reads success/skipped passed until now.
if [ -n "$RUN_CONCLUSION" ] && [ "$RUN_CONCLUSION" != "success" ]; then
  echo ""
  echo "Push pipeline failed — $RUN_URL"
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
    echo "Push pipeline failed — $RUN_URL"
    echo "gh run watch exited ${WATCH_STATUS} and the run conclusion is unavailable."
    echo "Treating the run as failed: the watcher saw something the job scan did not."
    show_failure_guidance "$RUN_ID" "$RUN_URL"
    exit 1
  fi
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
