#!/bin/sh
# Emit the Docker tags for the current build, one per line (ADR-040).
#
# Every build gets an immutable :<version>-<gitsha> plus a moving :latest. The bare
# :<version> is written ONLY when DOCKER_PUBLISH_SEMVER=1, i.e. on a package release.
# That is the whole point: a docker-only rebuild must never re-point a tag a
# self-hoster has already pinned.
#
# Outside a git checkout the sha tag is skipped, so `npm run build:docker` still works
# for someone building from the npm tarball (an ADR-039 driver — they have no git).
#
# Usage:
#   sh scripts/docker-tags.sh        # bare tags, one per line (for docker push)
#   sh scripts/docker-tags.sh -t     # each prefixed with "-t " (for docker build)
#
# ponytail: emits tags only, never builds or pushes. Callers compose.
set -eu

image=ghcr.io/mountain-pass/addressr
# THE PUBLISHED MANIFEST IS THE SOURCE OF TRUTH, not npm's environment.
# BROKEN AND FIXED 2026-08-10 by the workspace split. npm sets npm_package_name
# / npm_package_version from the manifest whose script is running, and the root
# manifest is now the PRIVATE workspace root `addressr-workspace` with no
# `version` field at all. So the env vars resolved to the wrong name and to
# nothing. Read the published manifest directly and keep the fail-closed `:?`.
# Resolved relative to THIS SCRIPT, not cwd, so it survives being invoked from
# anywhere; revisit if this script itself moves.
_manifest="$(dirname "$0")/../packages/addressr/package.json"
version="$(node -e "console.log(require(require('path').resolve('$_manifest')).version)" 2>/dev/null)"
: "${version:?could not read the published version from $_manifest}"

prefix=''
if [ "${1:-}" = '-t' ]; then
  prefix='-t '
fi

sha=''
if sha=$(git rev-parse --short HEAD 2>/dev/null); then
  :
else
  sha=''
fi

if [ -n "$sha" ]; then
  printf '%s%s:%s-%s\n' "$prefix" "$image" "$version" "$sha"
fi

printf '%s%s:latest\n' "$prefix" "$image"

if [ "${DOCKER_PUBLISH_SEMVER:-}" = '1' ]; then
  printf '%s%s:%s\n' "$prefix" "$image" "$version"
fi
