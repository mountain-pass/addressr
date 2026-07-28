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
version="${npm_package_version:?run this via npm so npm_package_version is set}"

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
