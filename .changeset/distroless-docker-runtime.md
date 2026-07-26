---
'@mountainpass/addressr': patch
---

Rebuild the published `mountainpass/addressr` Docker image on a Distroless runtime.

The image is now a multi-stage build: `node:22-bookworm-slim` installs the package, and
`gcr.io/distroless/nodejs22-debian12:nonroot` runs it. The published runtime no longer contains a
shell, a package manager, or npm, which removes that userland from the image's CVE surface. It
still runs as a non-root user and still ships the same `ELASTIC_*` and `ADDRESSR_INDEX_*` defaults,
so the server needs no configuration change.

Two changes for anyone running the image:

- There is no shell, so `docker exec ... sh` no longer works. Use `docker logs`, `docker inspect`,
  `docker cp`, and the `/health` endpoint instead.
- The loader is invoked by script path rather than by name, because the image entrypoint is now
  `node`. Use
  `docker run -v "$PWD/target:/home/nonroot/target" mountainpass/addressr /opt/addressr/lib/node_modules/@mountainpass/addressr/lib/bin/addressr-loader.js`
  in place of `docker run mountainpass/addressr addressr-loader`. The loader needs a writable
  `target` mount and cannot run under `--read-only`; the server still can.

The npm package is unchanged by this release.
