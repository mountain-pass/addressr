# Default-deny scan of a GitHub Actions run's jobs.
#
# Reads a TSV of "<conclusion>\t<job name>" on stdin, one job per line. Prints
# every job that did not succeed, and encodes the verdict in the EXIT CODE:
#
#   0  every job succeeded or was skipped
#   1  at least one job did not — the offending lines are on stdout
#   2  nothing was scanned — UNKNOWN, which is not success
#
# WHY THIS IS A FILE RATHER THAN A HEREDOC IN TWO SCRIPTS. It was inlined,
# identically, in scripts/push-and-watch.sh and scripts/release-watch.sh — the
# two watchers P085 exists for. Five defects deep, the tests pinning them could
# only assert that text was WRITTEN, never that it was REACHED or what it
# DECIDED, and P085 records where that leads: an assertion matched the call
# `wait_for_completion || exit 1` while it was commented out, and passed.
#
# Every hole P085 leaves open is a hole about an exit code, and a fixture can
# assert an exit code. That is the whole reason for this file.
#
# ALLOW-LISTS NOTHING, deliberately. The predecessor selected `conclusion ==
# "failure"`, so `cancelled`, `timed_out`, `startup_failure`, `neutral` and
# `action_required` all reached the success path — and so did `pending`, which
# is how a green run got reported RED when the scan ran before the run had
# finished. Anything that is not `success` or `skipped` is a failure here, so a
# job state nobody has thought of yet fails closed rather than passing.
#
# ONE EXEMPTION, and it is named rather than pattern-matched: `check-deps` is
# `continue-on-error: true` per ADR-015, so its failure is advisory. Matching by
# exact job name means a future advisory job must be added here deliberately.
BEGIN { bad = 0; seen = 0 }

{ seen++ }

# ADR-015: advisory by construction, so its conclusion carries no verdict.
$2 == "check-deps" { next }

$1 == "success" || $1 == "skipped" { next }

{ bad++; print }

END {
  # An empty scan is UNKNOWN, never success. The predecessor fell through to the
  # success path on an empty jobs array: printf fed awk one blank line, it
  # matched no rule, and execution reached the green branch having verified
  # nothing. That is the same shape as every other defect in P085 — silence read
  # as a pass.
  if (seen == 0) exit 2
  if (bad > 0) exit 1
  exit 0
}
