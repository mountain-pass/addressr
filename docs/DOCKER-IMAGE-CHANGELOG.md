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

Not pushed to Docker Hub. The `Docker Image` CI workflow has since run: the image **builds**, starts,
and answers `/health`, and the runtime user is the Distroless nonroot uid. What is not yet confirmed
is the stop-signal fix described below. See
[P055](problems/known-error/055-migrate-docker-image-alpine-to-distroless.md). The tag is recorded
here once the image is published.

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

**How the container handles stop signals.** A `tini` init runs as PID 1 and executes node as its
child, so `docker stop` (and any orchestrator sending `SIGTERM`) terminates the container promptly
instead of waiting out the grace period and being SIGKILLed. This replaces the `dumb-init` the Alpine
image carried; it is not a new requirement on you, and it changes nothing about how you run the
image. The command form above is unaffected — `tini` passes your arguments straight through to node,
so overriding the command to run the loader works exactly as shown.

One limit worth knowing before you rely on it: the container stops **promptly**, not **gracefully**.
Requests in flight when the stop signal arrives are dropped rather than allowed to finish. If you
run behind a load balancer, drain it before stopping the container. Adding a graceful-shutdown
handler is tracked as
[P067](problems/open/067-no-sigterm-graceful-shutdown-handler.md).

The npm package is unchanged by this image release.
