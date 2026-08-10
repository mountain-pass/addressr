#!/bin/sh
#
# Resolve THE version this deploy should ship, and print it on stdout.
#
# WHY THIS EXISTS (P095, realised in production 2026-08-08, run 31252424980).
# `deploy.sh` used to take `$npm_package_version` — the version in the job's
# working tree. `changesets/action` runs `changeset version` inside the release
# job to author the release PR, which BUMPS that working tree to the next
# version. The Deploy step runs later in the same job, so on a `deploy/**` push
# with a release pending it deployed a version that was not published. Elastic
# Beanstalk ran `npm install` for it and failed on both instances.
#
# AMENDED 2026-08-10. This paragraph used to open "the gate's THREE disjuncts
# are not equally safe" and turned on the third — a `deploy/**` push, which
# fired on a path diff and so said nothing about the version at all. That axis
# is retired; the gate now has two disjuncts and BOTH of them guarantee
# workspace-version == registry-version at the moment they fire.
#
# THE SPLIT BELOW SURVIVES ANYWAY, and the distinction is worth keeping
# straight: it is not that one disjunct is unsafe, it is that on the publish
# path the workspace version is correct BY CONSTRUCTION while on the dispatch
# path only the registry knows. Retiring the unsafe third disjunct removed the
# reason this script had to exist defensively; it did not remove the reason the
# two paths resolve differently. Do not collapse them on the strength of the
# axis going away.
#
# TWO PATHS, and the split is deliberate.
#
#   ADDRESSR_DEPLOY_JUST_PUBLISHED=1  -> use $npm_package_version.
#     Set by release.yml ONLY when `steps.changesets.outputs.published` is
#     'true'. On that path the workspace version IS the version just published,
#     correct by construction with no race. Reading the registry there would be
#     strictly worse: `npm view` is a CDN-served read of the `latest` dist-tag,
#     and `npm publish` returning does not guarantee an edge read reflects it.
#     A stale read would deploy the PREVIOUS version on a run that just
#     published — green, silent, with the EB label naming the wrong version.
#     Silent-wrong is the failure class this repo consistently treats as worse
#     than loud-wrong.
#
#   otherwise                          -> `npm view <pkg> version`.
#     The `deploy_only` path (and, until 2026-08-10, the retired `deploy/**`
#     push path). Whatever is on the registry is
#     what EB can actually install, which is the only thing that makes the
#     deployment manifest satisfiable.
#
# Missing the signal falls back to the registry read, so a caller that forgets
# to pass it fails in the safe direction.
#
# FAIL CLOSED. `deploy.sh` is `#!/bin/sh` with no `set -e`, and the old code got
# its fail-closed behaviour from `${npm_package_version:?required}`. That
# property is preserved explicitly here: an empty or failed resolution aborts
# non-zero and writes nothing, because a manifest pinning an empty version is
# worse than the defect this fixes.
#
# NOT to be "harmonised" with release.yml's own `npm view` call, which treats an
# empty result as a reason to exit 0 with a warning. That is correct there — an
# assertion that cannot run must not red the build — and catastrophic here.

set -u

# THE PUBLISHED MANIFEST IS THE SOURCE OF TRUTH, not npm's environment.
# BROKEN AND FIXED 2026-08-10 by the workspace split. npm sets npm_package_name
# / npm_package_version from the manifest whose script is running, and the root
# manifest is now the PRIVATE workspace root `addressr-workspace` with no
# `version` field at all. So the env vars resolved to the wrong name and to
# nothing. Read the published manifest directly and keep the fail-closed `:?`.
# Resolved relative to THIS SCRIPT, not cwd, so it survives being invoked from
# anywhere. The "revisit if this script itself moves" note this comment used to
# carry was the right warning and it fired: the script moved OUT of the
# packages/ tree and into apps/addressr-deployment/ on 2026-08-10, at which
# point `../addressr` resolved to apps/addressr, which does not exist. The
# published manifest did NOT move — it stays at packages/addressr, because
# packages/* is distributable and apps/* is deployed (ADR-046). So the hop is
# now up TWO levels and back down into packages/, and it is no longer a
# sibling lookup that a future move would silently preserve.
_manifest="$(dirname "$0")/../../packages/addressr/package.json"
pkg="$(node -e "console.log(require(require('path').resolve('$_manifest')).name)" 2>/dev/null)"
: "${pkg:?could not read the published package name from $_manifest}"


if [ "${ADDRESSR_DEPLOY_JUST_PUBLISHED:-}" = "1" ]; then
  # Publish path: correct by construction, no registry round-trip.
  _v="$(node -e "console.log(require(require('path').resolve('$_manifest')).version)" 2>/dev/null)"
  : "${_v:?could not read the published version from $_manifest}"
  printf '%s\n' "$_v"
  exit 0
fi

# `npm view <pkg> version` returns the `latest` dist-tag, deliberately: it is
# "what should production run", not "the highest version that exists". Reading
# `versions --json | last` would pick up a prerelease. `--prefer-online` takes
# npm's local metadata cache out of the picture.
resolved=$(npm view --prefer-online "$pkg" version 2>/dev/null)
status=$?

if [ "$status" -ne 0 ] || [ -z "$resolved" ]; then
  echo "resolve-version: could not resolve the published version of ${pkg} from the registry." >&2
  echo "resolve-version: refusing to deploy rather than write a manifest pinning an unusable version." >&2
  echo "resolve-version: (npm view exit=${status}, output='${resolved}')" >&2
  exit 1
fi

printf '%s\n' "$resolved"
