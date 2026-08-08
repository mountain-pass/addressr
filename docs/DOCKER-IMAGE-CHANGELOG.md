# Docker Image Changelog

Changes to the published `ghcr.io/mountain-pass/addressr` image, keyed by **image tag** rather than
npm version.

This file exists because the image and the npm package are released independently
([ADR 040](decisions/040-release-pipeline-change-type-action-matrix.proposed.md)). A change to the
image no longer implies a new npm version, so it will not always appear in
[`CHANGELOG.md`](../CHANGELOG.md) — that file is the npm package's changelog, and this one is the
image's. If you run the container, this is the file to watch.

Every build publishes an immutable `:<version>-<gitsha>` tag and moves `:latest`. The bare
`:<semver>` tag is written only on a package release, so it is never re-pointed by an image-only
rebuild.

## Unpublished

### Package layout moved: `lib/bin/` → `bin/`

**If you override `CMD` or run the loader with an explicit path, that path has changed.** The
package no longer ships a transpiled `lib/` directory — it ships its source directly
([ADR 044](decisions/044-native-esm-without-a-build-step.proposed.md)) — so the `lib/` segment is
gone from every path inside the installed package:

|        |                                                                                    |
| ------ | ---------------------------------------------------------------------------------- |
| Before | `/opt/addressr/lib/node_modules/@mountainpass/addressr/lib/bin/addressr-loader.js` |
| After  | `/opt/addressr/lib/node_modules/@mountainpass/addressr/bin/addressr-loader.js`     |

The first `lib/` is npm's global install prefix and is unchanged; it is the second one that goes.

Nothing else about running the image changes. The default `CMD` is updated in the image itself, so
`docker run ghcr.io/mountain-pass/addressr` needs no change, and the loader invocation documented
below is already corrected. Only a command you wrote yourself against the old path is affected.

The next publish carries the **registry move to GHCR** (below) plus the **Distroless runtime** entry
that follows it. The `Docker Image` CI workflow builds the image, smoke-tests it (starts, answers
`/health`, runs as the Distroless nonroot uid, stops on `SIGTERM`), and publishes to
`ghcr.io/mountain-pass/addressr` on merge to master. See
[P055](problems/known-error/055-migrate-docker-image-alpine-to-distroless.md). The tags are recorded
here once the image is published.

### Registry moved to GitHub Container Registry (breaking)

The image is now published to `ghcr.io/mountain-pass/addressr`
([ADR 040](decisions/040-release-pipeline-change-type-action-matrix.proposed.md)) — a public GHCR
package that pulls anonymously with no `docker login`, authenticated in CI by the built-in
`GITHUB_TOKEN`. **Breaking:** the former Docker Hub image `mountainpass/addressr` was published by
hand and is now frozen — it receives no further updates. Switch any pull to the new registry:

```sh
docker pull ghcr.io/mountain-pass/addressr
```

Existing Docker Hub tags still resolve to their old digests; they simply stop advancing.

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
  docker run -v "$PWD/target:/home/nonroot/target" ghcr.io/mountain-pass/addressr \
    /opt/addressr/lib/node_modules/@mountainpass/addressr/bin/addressr-loader.js
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
[P067](problems/verifying/067-no-sigterm-graceful-shutdown-handler.md).

The npm package is unchanged by this image release.
