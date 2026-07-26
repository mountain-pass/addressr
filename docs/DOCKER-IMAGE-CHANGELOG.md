# Docker Image Changelog

Changes to the published `mountainpass/addressr` image, keyed by **image tag** rather than npm
version.

This file exists because the image and the npm package are released independently
([ADR 040](decisions/040-release-pipeline-change-type-action-matrix.proposed.md)). A change to the
image no longer implies a new npm version, so it will not always appear in
[`CHANGELOG.md`](../CHANGELOG.md) — that file is the npm package's changelog, and this one is the
image's. If you run the container, this is the file to watch.

Every build publishes an immutable `:<version>-<gitsha>` tag and moves `:latest`. The bare
`:<semver>` tag is written only on a package release, so it is never re-pointed by an image-only
rebuild.

## Unpublished

Built and smoke-tested in CI but not yet pushed to Docker Hub. The tag is recorded here when it is.

### Distroless runtime

The image is rebuilt on a Distroless base
([ADR 039](decisions/039-distroless-docker-runtime.proposed.md)). It is now a multi-stage build:
`node:22-bookworm-slim` installs the package, and `gcr.io/distroless/nodejs22-debian12:nonroot` runs
it. The published runtime no longer contains a shell, a package manager, or npm, which removes that
userland from the image's CVE surface. It still runs as a non-root user and still ships the same
`ELASTIC_*` and `ADDRESSR_INDEX_*` defaults, so the server needs no configuration change.

**Two breaking changes if you run the image:**

- **No shell.** `docker exec ... sh` no longer works. Use `docker logs`, `docker inspect`,
  `docker cp`, and the `/health` endpoint instead.
- **The loader is invoked by script path**, because the image entrypoint is now `node`. Use

  ```sh
  docker run -v "$PWD/target:/home/nonroot/target" mountainpass/addressr \
    /opt/addressr/lib/node_modules/@mountainpass/addressr/lib/bin/addressr-loader.js
  ```

  in place of `docker run mountainpass/addressr addressr-loader`. The loader needs a writable
  `target` mount and cannot run under `--read-only`. The server still can.

The npm package is unchanged by this image release.
