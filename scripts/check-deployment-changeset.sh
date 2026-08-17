#!/usr/bin/env bash
# @jtbd JTBD-400 (Ship Releases Reliably From Trunk)
#
# ADR-045 confirmation criterion 5 — the changeset guard.
#
# THE RULE, in the ADR's words: "BLOCK when nothing pending will bump
# `apps/addressr-deployment`; PASS when an app changeset will cascade."
#
# WHY IT EXISTS. A Terraform-only change carries no changeset for any published
# package, so NOTHING releases — no release PR opens, nothing publishes, nothing
# deploys — and the author gets a green push with no signal. Then it worsens
# rather than resolves: weeks later an unrelated app changeset cascades a bump
# and the forgotten Terraform applies as a rider on a release nobody connected
# to it. A late surprise apply is worse than a loud refusal at push time.
#
# FAIL-CLOSED POLARITY IS INVERTED FROM `detect-deployment-bump.sh`, WHICH SITS
# IN THIS SAME DIRECTORY. NOT TO BE HARMONISED. That script fails closed by NOT
# DEPLOYING — exit 0, `changed=false` — because exiting non-zero there would red
# master on every ordinary push that does not bump the deployment version, which
# is nearly all of them. THIS script fails closed by BLOCKING THE PUSH: non-zero
# exit. Two adjacent scripts, opposite exit-code contracts, both correct. Its
# header carries the mirror of this note. A well-meaning tidy-up that aligns them
# turns one of the two into a no-op; the contract is asserted directly in
# test/js/__tests__/check-deployment-changeset.test.mjs so that reds.
#
# SCOPED TO MASTER BY ITS CALLERS, NOT BY THIS SCRIPT. Both call sites restrict
# it to `refs/heads/master` — same shape as `detect-deployment-bump.sh` being
# scoped by `if: github.event_name == 'push'` at its call site. That is
# load-bearing: JTBD-400 sanctions dispatching the plan workflow against a
# short-lived branch, and that push is by construction a new remote branch (so an
# all-zeros parent), carrying files under the watched tree (planning them is the
# point), usually with no changeset yet (you are checking BEFORE committing to
# the change). A guard that reds it would fire ADR-045's own "a guard people
# bypass is worse than none" criterion on day one. Scoping to master dissolves
# that by construction rather than by carve-out, and costs no coverage: infra can
# only sit unapplied once it reaches master.
#
# ON RENAMES, AND WHAT ACTUALLY DOES THE WORK — measured, not assumed.
#
# The design review asserted that rename detection (on by default) would make a
# move OUT of the watched tree print only DESTINATION paths, leaving the trigger
# set empty so a pure refactor passed silently, and that `--no-renames` was what
# prevented it. That was replayed against a real `git mv` and IT IS NOT TRUE FOR
# THIS INVOCATION. With a pathspec limiting the diff to the watched directory,
# `git diff --name-only` prints the SOURCE path either way:
#
#     git diff --name-only            HEAD~1 HEAD -- apps/addressr-deployment
#       -> apps/addressr-deployment/main.tf
#     git diff --name-only --no-renames HEAD~1 HEAD -- apps/addressr-deployment
#       -> apps/addressr-deployment/main.tf
#
# THE PATHSPEC is what preserves the source path, not the flag. `--no-renames` is
# kept anyway, and deliberately: it costs nothing, it states the intent, and it
# is the thing that still holds if a future edit drops or widens the pathspec —
# which is the shape that WOULD hide a move behind an `R` status. Recorded this
# way round because a comment claiming a flag is load-bearing when it is not is
# how a later "this flag does nothing, remove it" cleanup lands correctly and
# breaks nothing, teaching everyone the wrong lesson about the next flag.
#
# What is pinned in test is the OBSERVABLE behaviour — a move out BLOCKS —
# replayed against a real `git mv`, which is the evidence standard the
# 2026-08-10 axis retirement used. This tree moved twice in one day and ADR-046
# anticipates further moves once `apps/website` lands.
#
# Usage: check-deployment-changeset.sh <BEFORE_REF> [HEAD_REF]
#   exit 0  = PASS, the push may proceed
#   exit 1  = BLOCK
set -u

BEFORE="${1:-}"
HEAD_REF="${2:-HEAD}"

DEPLOY_DIR='apps/addressr-deployment'
MANIFEST="${DEPLOY_DIR}/package.json"
ZEROS='0000000000000000000000000000000000000000'

# ---------------------------------------------------------------------------
# Pending changesets, read from the HEAD TREE OBJECT.
#
# Not from the range diff: a changeset that landed in an EARLIER push and is
# still pending would go unseen, and a perfectly well-declared follow-up infra
# push would red. That is the mixed-push false red ADR-045's reassessment
# criteria say would falsify the rule.
#
# Not from the working tree: an uncommitted `.changeset/*.md` would PASS the
# pre-push hook while the pushed commits carry nothing. That is P011 (`ef66d39`)
# reappearing inside the guard built to catch it, and it would make the two
# surfaces disagree — hook green, CI red, which is the worst of both.
#
# `config.json` and `pre.json` fall out for free by not being `*.md`.
# ---------------------------------------------------------------------------
pending_changesets() {
    git ls-tree -r --name-only "$HEAD_REF" -- .changeset 2>/dev/null |
        grep -E '\.changeset/.*\.md$' |
        grep -v '\.changeset/README\.md$'
}

# The cascade set: the deployment package itself, plus every INTERNAL workspace
# package it depends on. DERIVED from the same manifest changesets reads to
# compute the cascade, so the guard cannot answer a different question than the
# release will. Hardcoding the app package name would be a SECOND statement of
# the cascade set — the drift class the shared-predicate shape exists to prevent.
#
# Fails LOUD rather than empty: a silently empty cascade set would degrade this
# guard into always-require-a-deployment-changeset, one of the three shapes
# criterion 5 explicitly REJECTED for over-firing on every mixed push.
cascade_set() {
    git show "${HEAD_REF}:${MANIFEST}" 2>/dev/null | node -e '
        let s = "";
        process.stdin.on("data", (d) => (s += d));
        process.stdin.on("end", () => {
            let m;
            try { m = JSON.parse(s); } catch { process.exit(3); }
            if (!m || typeof m.name !== "string") process.exit(3);
            const deps = Object.assign({},
                m.dependencies, m.devDependencies, m.peerDependencies);
            // Every dependency name, plus the package itself. Resolving these
            // against the workspace package set happens in the caller, so an
            // external dependency can never be mistaken for an internal one.
            console.log([m.name, ...Object.keys(deps)].join("\n"));
        });
    ' 2>/dev/null
}

# The workspace package set, from the root manifest's `workspaces` globs — the
# invariant ADR-046 makes load-bearing. Used to intersect the cascade candidates
# so a third-party dependency of the deployment package never counts as internal.
workspace_packages() {
    git show "${HEAD_REF}:package.json" 2>/dev/null | node -e '
        let s = "";
        process.stdin.on("data", (d) => (s += d));
        process.stdin.on("end", () => {
            let root;
            try { root = JSON.parse(s); } catch { process.exit(3); }
            const globs = root.workspaces;
            if (!Array.isArray(globs) || globs.length === 0) process.exit(3);
            // Emit the directory prefixes; the caller resolves them against the
            // tree. Only the `dir/*` shape this repo uses is supported, and an
            // unsupported shape exits non-zero rather than silently matching
            // nothing.
            const prefixes = globs.map((g) => {
                if (!g.endsWith("/*")) process.exit(3);
                return g.slice(0, -2);
            });
            console.log(prefixes.join("\n"));
        });
    ' 2>/dev/null
}

block() {
    printf '\n' >&2
    printf 'DEPLOY GUARD: refusing this push.\n' >&2
    printf '\n' >&2
    printf '%s\n' "$1" >&2
    printf '\n' >&2
    printf 'WHY THIS MATTERS. A change under %s that arms no deployment\n' "$DEPLOY_DIR" >&2
    printf 'version bump does not merely wait — nothing releases at all, so the\n' >&2
    printf 'Terraform SITS UNAPPLIED on master. Weeks later an unrelated app\n' >&2
    printf 'changeset cascades a bump and it applies as a RIDER on a release\n' >&2
    printf 'nobody connected to it. That is the surprise this refusal prevents.\n' >&2
    printf '\n' >&2
    printf 'TO FIX IT — run:\n' >&2
    printf '\n' >&2
    printf '    npx changeset\n' >&2
    printf '\n' >&2
    printf 'and select @mountainpass/addressr-deployment (patch is usually\n' >&2
    printf 'right for an infrastructure change). Commit the generated\n' >&2
    printf '.changeset/*.md file with your change and push again.\n' >&2
    printf '\n' >&2
    printf 'An app changeset for @mountainpass/addressr also satisfies this\n' >&2
    printf 'guard, because it cascades a bump into the deployment package. You\n' >&2
    printf 'do not need both.\n' >&2
    printf '\n' >&2
    printf 'IF YOU GENUINELY CANNOT — for a recovery push whose parent ref\n' >&2
    printf 'cannot be resolved — add this trailer to a commit message in the\n' >&2
    printf 'push and it will be honoured here and in CI:\n' >&2
    printf '\n' >&2
    printf '    Deploy-Guard-Bypass: <why>\n' >&2
    printf '\n' >&2
    printf 'It is committed, greppable and reviewed. Prefer it over\n' >&2
    printf '--no-verify, which also drops the risk-score and external-comms\n' >&2
    printf 'gates and leaves no record that this guard was skipped.\n' >&2
    exit 1
}

pass() {
    printf 'deploy-guard: %s\n' "$1"
    exit 0
}

# ---------------------------------------------------------------------------
# 1. The bypass trailer, scanned across EVERY commit in the range — not only the
#    tip. A recovery push of several commits would otherwise need the trailer
#    duplicated onto the last one, friction that pushes people to `--no-verify`
#    instead, which also drops the risk-score and external-comms gates.
# ---------------------------------------------------------------------------
if [ -n "$BEFORE" ] && [ "$BEFORE" != "$ZEROS" ] &&
    git rev-parse --verify --quiet "${BEFORE}^{commit}" >/dev/null 2>&1; then
    RANGE_OK=1
else
    RANGE_OK=0
fi

if [ "$RANGE_OK" -eq 1 ]; then
    if git log --format='%B' "${BEFORE}..${HEAD_REF}" 2>/dev/null |
        grep -qE '^[[:space:]]*Deploy-Guard-Bypass:[[:space:]]*[^[:space:]]'; then
        pass 'Deploy-Guard-Bypass trailer present — allowed, and recorded in the commit'
    fi
else
    # Same scan, bounded, when the parent is unusable — and the bound has a
    # KNOWN WEAKNESS, recorded here rather than in JTBD-400 because writing `-50`
    # into job text would pin an implementation constant the way the job document
    # deliberately avoids pinning the cascade set.
    #
    # The range is undeterminable by premise, so this scans the last 50 commits
    # of HISTORY rather than the commits being pushed. A trailer written
    # legitimately for one recovery therefore keeps satisfying this branch for up
    # to 50 subsequent commits, on any later push whose parent is also
    # unresolvable. It is not a hole in the ordinary path — that branch scans the
    # real range — but it does mean the trailer is not strictly one-shot here,
    # while JTBD-400's countability outcome treats each trailer as a discrete
    # event. If the count ever reads lower than the bypasses actually taken, this
    # is where the discrepancy comes from.
    if git log --format='%B' -50 "$HEAD_REF" 2>/dev/null |
        grep -qE '^[[:space:]]*Deploy-Guard-Bypass:[[:space:]]*[^[:space:]]'; then
        pass 'Deploy-Guard-Bypass trailer present — allowed, and recorded in the commit'
    fi
fi

# ---------------------------------------------------------------------------
# 2. Is anything pending that will bump the deployment package?
#
#    Computed BEFORE the range check, because it is the answer to the rule as
#    stated and it does not depend on the parent at all. An unresolvable parent
#    means you cannot determine WHAT CHANGED; it does not mean you cannot
#    determine WHAT IS PENDING.
# ---------------------------------------------------------------------------
CASCADE=$(cascade_set)
[ -n "$CASCADE" ] ||
    block "Could not read ${MANIFEST} at ${HEAD_REF}, so the cascade set is unknown.
Refusing rather than guessing: an empty cascade set would silently turn this
guard into 'every push needs a deployment changeset', which over-fires on every
ordinary mixed push."

PREFIXES=$(workspace_packages)
[ -n "$PREFIXES" ] ||
    block "Could not read the workspaces globs from package.json at ${HEAD_REF},
so the cascade set cannot be resolved against the workspace. Refusing rather
than guessing."

# Keep only cascade candidates that are genuinely workspace-internal.
INTERNAL=""
while IFS= read -r pkg; do
    [ -n "$pkg" ] || continue
    while IFS= read -r prefix; do
        [ -n "$prefix" ] || continue
        # A workspace package is one whose manifest lives under a globbed
        # directory and declares this name.
        while IFS= read -r candidate; do
            [ -n "$candidate" ] || continue
            name=$(git show "${HEAD_REF}:${candidate}" 2>/dev/null |
                node -pe 'let s="";try{s=JSON.parse(require("fs").readFileSync(0,"utf8")).name||""}catch{};s' 2>/dev/null)
            if [ "$name" = "$pkg" ]; then
                INTERNAL="${INTERNAL}${pkg}
"
                break
            fi
        done <<EOF
$(git ls-tree -r --name-only "$HEAD_REF" -- "$prefix" 2>/dev/null | grep -E "^${prefix}/[^/]+/package\.json$")
EOF
    done <<EOF
$PREFIXES
EOF
done <<EOF
$CASCADE
EOF

[ -n "$INTERNAL" ] ||
    block "The deployment package's cascade set resolved to nothing inside the
workspace, so this guard cannot tell which changesets would bump it. Refusing
rather than guessing."

DECLARED=0
while IFS= read -r cs; do
    [ -n "$cs" ] || continue
    body=$(git show "${HEAD_REF}:${cs}" 2>/dev/null) || continue
    while IFS= read -r pkg; do
        [ -n "$pkg" ] || continue
        # Changeset frontmatter names packages as quoted or bare YAML keys.
        if printf '%s' "$body" |
            grep -qE "^[[:space:]]*['\"]?$(printf '%s' "$pkg" | sed 's/[\/&]/\\&/g')['\"]?[[:space:]]*:"; then
            DECLARED=1
            break
        fi
    done <<EOF
$INTERNAL
EOF
    [ "$DECLARED" -eq 1 ] && break
done <<EOF
$(pending_changesets)
EOF

if [ "$DECLARED" -eq 1 ]; then
    pass 'a pending changeset will bump the deployment package'
fi

# ---------------------------------------------------------------------------
# 3. Nothing pending will bump it. Now — and only now — does the range matter,
#    because it decides whether this push actually touched infrastructure.
# ---------------------------------------------------------------------------
if [ "$RANGE_OK" -eq 0 ]; then
    block "The parent ref ('${BEFORE:-<empty>}') could not be resolved, so this push's
changes cannot be determined — AND no pending changeset would bump the
deployment package. Refusing on the second half: with nothing pending, an
infrastructure change in this push would sit unapplied."
fi

# `--no-renames` — see the header. `--diff-filter` is deliberately NOT set: a
# deletion under the tree is exactly the move case this must catch.
CHANGED=$(
    git diff --name-only --no-renames "$BEFORE" "$HEAD_REF" -- "$DEPLOY_DIR" 2>/dev/null |
        grep -v "^${DEPLOY_DIR}/package\.json$" |
        grep -vE '\.md$' |
        grep -vE '\.test\.(js|mjs|cjs)$'
)

[ -n "$CHANGED" ] || pass 'no infrastructure change in this push'

# Was the trigger set produced entirely by files leaving the tree? Then say so,
# so the operator reads "this is a tree move, use the trailer" rather than "the
# guard is broken".
SURVIVING=$(git ls-tree -r --name-only "$HEAD_REF" -- "$DEPLOY_DIR" 2>/dev/null)
MOVED=1
while IFS= read -r f; do
    [ -n "$f" ] || continue
    if printf '%s\n' "$SURVIVING" | grep -qxF "$f"; then
        MOVED=0
        break
    fi
done <<EOF
$CHANGED
EOF

if [ "$MOVED" -eq 1 ]; then
    block "Every changed path under ${DEPLOY_DIR} is GONE at ${HEAD_REF}, so this push
looks like a tree MOVE (a rename out of the watched directory) rather than an
infrastructure edit:

$(printf '%s' "$CHANGED" | sed 's/^/    /')

A move is blocked rather than waved through because the guard cannot tell a
pure relocation from a relocation that also edits what it moves. If this is a
pure move, the Deploy-Guard-Bypass trailer below is the right answer."
fi

block "This push changes infrastructure under ${DEPLOY_DIR}:

$(printf '%s' "$CHANGED" | sed 's/^/    /')

but nothing pending will bump @mountainpass/addressr-deployment, so merging the
release PR will apply NOTHING."
