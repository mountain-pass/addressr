#!/bin/bash
# Mutation-test a guard: break the thing it watches, prove it goes red, restore.
#
#   scripts/mutate.sh <file> <sed-expression> <test command...>
#
# Exit 0  CAUGHT — the test failed under the mutation. The guard works.
# Exit 1  BLIND  — the test PASSED under the mutation. The guard does not watch
#                  what you think it watches.
# Exit 2  NO-OP / ERROR — nothing was tested: the sed expression changed nothing,
#                  the test command was already red before mutating, the command
#                  could not be run at all, or it was interrupted.
#
# WHY THIS EXISTS. A check that cannot fail is indistinguishable from a check
# that passes, and this repo has been bitten by that repeatedly: a regex with an
# `m` flag that read headings and nothing else; `\b` in a template literal, which
# is a backspace character, so an entry match found nothing; a byte scan that
# counted overlapping windows and could not tell zip64 from a plain archive;
# `find -size +0`, which means blocks not bytes and so reported every file
# non-empty. Every one reported green. Mutation is what caught them.
#
# EXIT 2 IS THE POINT, not a convenience. Twice in one session a hand-rolled
# mutation loop reported every mutation "caught" while the sed had silently
# matched nothing — the loop was testing the unmutated file. A mutation that did
# not apply is not a passing test, it is no test, and it must be louder than a
# blind guard rather than quieter.
#
# The file is restored on every exit path, including interrupt.
set -uo pipefail

if [ "$#" -lt 3 ]; then
  echo "usage: $0 <file> <sed-expression> <test command...>" >&2
  echo "example: $0 scripts/scan-jobs.awk 's/exit 2/exit 0/' npm run test:js" >&2
  exit 2
fi

TARGET="$1"; EXPR="$2"; shift 2

[ -f "$TARGET" ] || { echo "mutate: no such file: $TARGET" >&2; exit 2; }

BACKUP="$(mktemp)" || { echo "mutate: mktemp failed; refusing to touch $TARGET" >&2; exit 2; }
[ -n "$BACKUP" ] || { echo "mutate: mktemp gave an empty path; refusing" >&2; exit 2; }

# Guard the backup BEFORE mutating. There is no `set -e` here, so an unchecked
# cp fails silently — and a SHORT backup (full disk) is worse than none, because
# restore would copy the truncated copy back over the original and destroy it.
cp "$TARGET" "$BACKUP" || { rm -f "$BACKUP"; echo "mutate: backup failed; refusing to touch $TARGET" >&2; exit 2; }
# NOT COVERED BY A TEST, and saying so rather than implying otherwise: reaching
# this line needs a cp that reports success while producing a different file,
# which takes fault injection (a full disk mid-write). Mutation-testing the
# suite confirms deleting this line changes no test result. It is kept as
# defence-in-depth for the case the line above cannot report, and it establishes
# nothing about whether that case is handled correctly in practice.
cmp -s "$TARGET" "$BACKUP" || { rm -f "$BACKUP"; echo "mutate: backup is not identical to $TARGET; refusing" >&2; exit 2; }

# Echoed so a SIGKILL — which no trap can catch — leaves a recoverable pointer
# rather than an unnamed copy in the temp dir.
echo "backup: $BACKUP"
restore() {
  # Disarm first, so this runs exactly ONCE. A bash trap handler that does not
  # exit returns to where the signal landed, and the EXIT trap then fires the
  # same handler again — the second pass would find the backup already removed
  # and print a recovery instruction naming a file it had itself deleted.
  # Two mechanisms for one property (restore runs once). Mutation testing shows
  # removing EITHER alone changes no test result, and removing BOTH is caught —
  # so this is redundancy, not two independently-pinned guards. Said plainly
  # because "covered by a test" would be the wrong thing to read here.
  trap - EXIT INT TERM
  [ -f "$BACKUP" ] || return 0
  # Best-effort: there is nowhere to return a failure to from a trap, so it is
  # reported. The backup path was echoed before the mutation for exactly this.
  cp "$BACKUP" "$TARGET" || echo "mutate: RESTORE FAILED — recover from $BACKUP" >&2
  rm -f "$BACKUP"
}
# Signals exit rather than resuming, so a handler cannot return into the middle
# of a run and grade a file it has just restored.
#
# What this is actually worth, measured rather than assumed: NOTHING the suite
# can see. Deleting these two lines is not caught, and neither is reverting to
# the old returning-handler form. Both were checked. An interrupt reaches the
# test command too, which returns 130, and not_a_verdict already refuses to
# call that a verdict — and THAT arm is pinned. So the real guard against a
# false verdict on interrupt is the classification, not these traps; they are
# defence-in-depth behind it, and deleting them falls back to bash's default
# disposition, which also terminates — measured on THIS bash, by the delivered-
# signal test, which still passes with the INT trap deleted. What is not
# measured is portability: the repo runs bash 3.2 on macOS and bash 5.x in CI,
# and only one of them has been observed. That narrower reason is why the lines
# stay. The failure they cover is a mutated file left on disk in a working
# tree, which is the one destructive outcome this script has, so two inert
# lines are a cheap hedge against one interpreter behaving differently.
#
# Written this way because the first version of this comment claimed these
# lines prevented grading an unmutated file. They do not. The claim survived
# one round of review and was caught by mutating the file, which is the whole
# argument of the ticket this script was built for.
trap 'restore; exit 130' INT
trap 'restore; exit 143' TERM
trap restore EXIT

# 126 is "found but not executable", 127 is "command not found" — a typo in the
# test command, not a guard doing its job. 130 and 143 are interrupt and
# terminate. Reporting any of these as a verdict is the same no-test-ran hole
# that exit 2 closes on the sed side, arriving through the other door. Both the
# baseline run and the mutated run are classified through here.
not_a_verdict() {
  case "$1" in
    126|127) echo "ERROR  the test command could not be run (exit $1) — nothing was tested" >&2; return 0 ;;
    130|143) echo "ERROR  the test command was interrupted (exit $1) — nothing was tested" >&2; return 0 ;;
  esac
  return 1
}

# A red baseline makes every mutation report CAUGHT, so the run would "prove"
# every guard works on a tree where nothing works. This is the mirror of
# dirty-tree-green: an unmutated failure is not evidence about the mutation.
"$@" >/dev/null 2>&1
BASELINE=$?
not_a_verdict "$BASELINE" && exit 2
if [ "$BASELINE" -ne 0 ]; then
  echo "ERROR  the test command already fails on the UNMUTATED $TARGET (exit $BASELINE)" >&2
  echo "       Every mutation would report a catch. Get to green first." >&2
  exit 2
fi

# BSD and GNU sed disagree about -i; write through a temp file so this works on
# both rather than depending on which one is first on PATH.
TMP="$(mktemp)" || { echo "ERROR  mktemp failed — nothing was tested" >&2; exit 2; }
[ -n "$TMP" ] || { echo "ERROR  mktemp gave an empty path — nothing was tested" >&2; exit 2; }
sed "$EXPR" "$TARGET" > "$TMP" || { rm -f "$TMP"; echo "ERROR  sed failed on $EXPR — nothing was tested" >&2; exit 2; }

if cmp -s "$TARGET" "$TMP"; then
  rm -f "$TMP"
  echo "NO-OP  the expression changed nothing in $TARGET — nothing was tested" >&2
  echo "       (a mutation that does not apply is not a passing test, it is no test)" >&2
  exit 2
fi
# The write that lands the mutation. Unchecked, a failure here means the test
# runs against an UNMUTATED file and the run reports a verdict it has not
# earned — the same no-test-ran hole exit 2 exists to close. The common cause
# is a read-only target, which needs no fault injection to reach, so this is
# tested rather than annotated.
cp "$TMP" "$TARGET" || { rm -f "$TMP"; echo "ERROR  could not write the mutation to $TARGET — nothing was tested" >&2; exit 2; }
rm -f "$TMP"

echo "mutating $TARGET with: $EXPR"
"$@" >/dev/null 2>&1
STATUS=$?

# Reachable even though the baseline already vetted the command: the mutated
# file can make the command fail in a way that is not a verdict — a syntax error
# that stops it executing, or a Ctrl-C during the slower mutated run.
not_a_verdict "$STATUS" && exit 2

if [ "$STATUS" -eq 0 ]; then
  echo "BLIND  the guard PASSED under this mutation — it does not watch this property"
  exit 1
fi
echo "CAUGHT the guard failed under this mutation, as it should"
exit 0
