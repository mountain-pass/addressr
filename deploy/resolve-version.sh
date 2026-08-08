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
# The gate's three disjuncts are not equally safe. `published == 'true'` and
# `deploy_only == true` both guarantee workspace-version == registry-version.
# `deploy-paths.changed` fires on a `deploy/**` push and says nothing about the
# version at all. This script is where that difference is handled, rather than a
# condition bolted in front of the gate: a `deploy/**` push during a pending
# release now deploys the infrastructure change against the CURRENTLY PUBLISHED
# version, which is what it should always have done.
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
#     The `deploy/**` and `deploy_only` paths. Whatever is on the registry is
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

pkg="${npm_package_name:?npm_package_name required}"

if [ "${ADDRESSR_DEPLOY_JUST_PUBLISHED:-}" = "1" ]; then
  # Publish path: correct by construction, no registry round-trip.
  printf '%s\n' "${npm_package_version:?npm_package_version required}"
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
