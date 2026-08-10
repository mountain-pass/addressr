#!/bin/sh
#
# Decide whether this push arms a production Terraform apply. Prints exactly one
# line on stdout: `changed=true` or `changed=false`.
#
# ADR-045: an infrastructure change reaches production when the deployment
# package's version VALUE differs between `github.event.before` and HEAD, AND
# the push consumed changesets. Both conjuncts are required. Everything else
# denies.
#
# WHY A VALUE COMPARISON AND NOT A PATH DIFF — the whole reason this exists.
# The predecessor axis diffed a PATH, so a rename OUT of the watched directory
# presented as deletions UNDER it and would have armed a production apply on a
# pure refactor. That axis was retired for it (dd9c950b). A value comparison is
# structurally immune: on a rename the HEAD-side read FAILS rather than DIFFERS,
# so this script denies. That is not a happy accident, it is the design.
#
# WHY THE SECOND CONJUNCT. A hand-edited version bump pushed straight to master
# would otherwise arm a production apply at push-tier with no risk score — the
# hazard the 2026-08-10 axis retirement withdrew, re-entering by another door.
# User-directed in preference to the simpler any-version-change predicate.
#
# WHAT THIS DELIBERATELY DOES *NOT* REJECT. A locally-run `changeset version`
# pushed direct to master deletes changesets and bumps the version, so it arms.
# That is correct: a changeset was genuinely consumed. It is not the hand edit
# the second conjunct rejects. Do not "fix" it.
#
# FAIL-CLOSED POLARITY, AND IT IS NOT THE SAME AS THE CHANGESET GUARD'S.
# Here fail-closed means DO NOT DEPLOY: exit 0, print `changed=false`. It must
# NOT exit non-zero — that fails the step, fails the job, and reds master on
# every ordinary push that does not bump the deployment version, which is nearly
# all of them. ADR-045's words are "an indeterminable range must not deploy",
# a deploy predicate rather than a build verdict.
#
# The changeset guard (ADR-045 criterion 5) has the OPPOSITE polarity: its
# fail-closed BLOCKS THE PUSH. Two surfaces, two polarities, both correct.
# NOT to be "harmonised" — same shape as resolve-version.sh's note about not
# harmonising its fail-closed with release.yml's `npm view`.
#
# STDOUT IS A CONTRACT. The caller appends stdout to $GITHUB_OUTPUT, so a stray
# line here injects an arbitrary step output. Reasons go to stderr, always.
#
# No `set -e`: every failure is handled explicitly below, and an unhandled one
# must not abort mid-way leaving stdout empty. `set -u` is safe and catches a
# typo'd variable.

set -u

MANIFEST=apps/addressr-deployment/package.json
BEFORE="${1:-}"
# The head-side ref. Defaults to HEAD, which is what the workflow wants — it
# runs on the checked-out commit. `release-watch.sh` passes `origin/master`
# explicitly, because at the point it checks, the LOCAL HEAD is still behind the
# merge it just made and comparing against it would silently answer about the
# wrong commit.
HEAD_REF="${2:-HEAD}"
ZEROS=0000000000000000000000000000000000000000

# The only two exits. Both are exit 0 — see the polarity note above.
deny() {
    echo "changed=false"
    echo "detect-deployment-bump: no deploy — $1" >&2
    exit 0
}
arm() {
    echo "changed=true"
    echo "detect-deployment-bump: ARMED — $1" >&2
    exit 0
}

# Non-push events carry no `github.event.before` at all. The workflow also
# guards with `if: github.event_name == 'push'`, but this leg exists so the
# fail-closed property does not rest solely on a YAML condition a future edit
# could drop.
[ -n "$BEFORE" ] || deny "no before-ref supplied (not a push event?)"

[ "$BEFORE" != "$ZEROS" ] || deny "all-zeros before-ref: branch creation, no parent to diff"

git cat-file -e "${BEFORE}^{commit}" 2>/dev/null ||
    deny "before-ref ${BEFORE} is not a reachable commit (force-pushed away, or a shallow clone)"

# Read the version VALUE at a ref. Empty output means "could not determine",
# which every caller below treats as a denial.
read_version() {
    git show "$1:${MANIFEST}" 2>/dev/null | node -e '
        let s = "";
        process.stdin.on("data", (d) => (s += d)).on("end", () => {
            try {
                const v = JSON.parse(s).version;
                if (typeof v === "string" && v.length > 0) process.stdout.write(v);
            } catch {
                /* unparseable manifest is a denial, not a crash */
            }
        });
    ' 2>/dev/null
}

before_version=$(read_version "$BEFORE")
head_version=$(read_version "$HEAD_REF")

[ -n "$before_version" ] || deny "no readable version at ${BEFORE}:${MANIFEST}"
# THE RENAME CASE. If the tree moved, this read fails and we deny — where a path
# diff would have reported a change and armed an apply.
[ -n "$head_version" ] || deny "no readable version at ${HEAD_REF}:${MANIFEST} (renamed or removed?)"

[ "$before_version" != "$head_version" ] ||
    deny "version unchanged at ${head_version}"

# Did this push CONSUME changesets? Three mechanics, each load-bearing:
#   - the pathspec is QUOTED, so git does the matching rather than the shell
#     expanding it against the working tree (an unquoted glob would restrict the
#     diff to files present at HEAD and the deletions would vanish, denying
#     silently);
#   - --no-renames, because a deleted changeset paired with a similar added file
#     is reported R rather than D and --diff-filter=D would miss it;
#   - README.md excluded — it is not a changeset.
consumed=$(
    git diff --name-only --no-renames --diff-filter=D \
        "$BEFORE" "$HEAD_REF" -- '.changeset/*.md' ':(exclude).changeset/README.md' 2>/dev/null | wc -l
)

[ "${consumed:-0}" -gt 0 ] ||
    deny "version moved ${before_version} -> ${head_version} but no changeset was consumed (hand edit?)"

arm "deployment version ${before_version} -> ${head_version}, ${consumed} changeset(s) consumed"

# Unreachable. Structural backstop: if a future edit adds a path that falls
# through, it denies rather than silently emitting nothing and letting the
# caller's empty output mean whatever the caller decides.
deny "fell through without a verdict"
