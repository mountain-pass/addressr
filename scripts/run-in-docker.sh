#!/bin/sh

export IMAGE=node:11.14.0-alpine

mkdir -p target/docker
cp ./scripts/run.sh target/docker/.
# Version derived, not hardcoded. This said 1.0.0 while the package was at
# 3.3.0 — stale long before the workspace split, and it would have copied a
# file that has not existed for years. Read it from the package manifest,
# which moved to packages/addressr/ on 2026-08-10.
APP_VERSION=$(node -p "require('./packages/addressr/package.json').version")
cp "mountainpass-addressr-${APP_VERSION}.tgz" target/docker/.
docker run -i -t -p 8080:8080 -u node -v "$PWD/target/docker:/mnt/addressr" $IMAGE sh -c "cd /mnt/addressr \
    && ./run.sh  mountainpass-addressr-${APP_VERSION}.tgz"
