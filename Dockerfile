# Multi-stage build for the published mountainpass/addressr image (ADR-039).
# The build stage installs the packed tarball globally with npm; the runtime stage is
# Distroless, which has no shell, no package manager and no npm. The build and runtime
# images are both Debian 12 so the two stages share a libc. That parity is load-bearing
# in the present tense, not just anticipatory: the tini binary copied across is
# glibc-linked. Do not swap BUILD_IMAGE to an Alpine variant.
ARG BUILD_IMAGE=node:22-bookworm-slim
ARG RUNTIME_IMAGE=gcr.io/distroless/nodejs22-debian12:nonroot

FROM ${BUILD_IMAGE} AS build

# tini becomes PID 1 in the runtime stage (see the ENTRYPOINT note below). apt rather
# than an upstream static download: a Debian-signed package is a better supply-chain
# input than an unpackaged binary with a hand-maintained checksum, and the shared
# Debian 12 libc is what makes the dynamically linked build safe to copy across.
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/*

ARG PACKAGE_TGZ
COPY "${PACKAGE_TGZ}" "/tmp/${PACKAGE_TGZ}"
RUN npm install --prefer-offline --no-audit -g --prefix /opt/addressr "/tmp/${PACKAGE_TGZ}"

FROM ${RUNTIME_IMAGE}

ARG MAINTAINER
LABEL maintainer="${MAINTAINER}"
ARG PACKAGE
LABEL package="${PACKAGE}"
ARG VERSION
LABEL version="${VERSION}"

COPY --from=build /opt/addressr /opt/addressr
COPY --from=build /usr/bin/tini /tini

ENV ELASTIC_PORT="9200"
ENV ELASTIC_HOST="host.docker.internal"
ENV ELASTIC_USERNAME=
ENV ELASTIC_PASSWORD=
ENV ELASTIC_PROTOCOL=

ENV ADDRESSR_INDEX_TIMEOUT="30s"
ENV ADDRESSR_INDEX_BACKOFF="1000"
ENV ADDRESSR_INDEX_BACKOFF_INCREMENT="1000"
ENV ADDRESSR_INDEX_BACKOFF_MAX="10000"

# Writable home for the nonroot user (uid 65532). The loader writes cwd-relative
# paths (target/gnaf, target/keyv-file.msgpack), so cwd must be writable; /opt/addressr
# arrives root-owned from the build stage and is read-only to the runtime user.
WORKDIR /home/nonroot

# tini is PID 1, not node. The Distroless nodejs ENTRYPOINT is ["/nodejs/bin/node"], and
# running node there directly does NOT work: the kernel applies no default signal
# dispositions to PID 1, so an unhandled SIGTERM is discarded and `docker stop` SIGKILLs
# the container at the 10s grace deadline. The build-and-smoke job caught exactly that.
# tini forwards SIGTERM to node, which as a child does carry the default disposition and
# exits, and tini reaps orphans as a proper init should. It needs no privilege, so the
# base image's nonroot uid 65532 is unchanged.
#
# tini makes the container STOP promptly; it does not make it stop GRACEFULLY. node takes
# the default disposition and dies at once, so in-flight requests are dropped. Draining
# them needs an app-level process.on('SIGTERM') wired to stopServer(), tracked as P067.
#
# CMD is the resolved script path rather than the addressr-server-2 bin shim: there is no
# shell and no /usr/bin/env to resolve it. tini appends the CMD args and execs node, so
# overriding CMD on the command line works exactly as it did before.
# The loader is invoked the same way, but needs a writable cwd: GNAF_DIR relocates
# the G-NAF download, and the CKAN package cache at target/keyv-file.msgpack has no
# env override, so mount over the whole target directory rather than just GNAF_DIR.
# The loader therefore cannot run with --read-only, unlike the server.
#   docker run -v "$PWD/target:/home/nonroot/target" mountainpass/addressr \
#     /opt/addressr/lib/node_modules/@mountainpass/addressr/lib/bin/addressr-loader.js
ENTRYPOINT ["/tini", "--", "/nodejs/bin/node"]
CMD ["/opt/addressr/lib/node_modules/@mountainpass/addressr/lib/bin/addressr-server-2.js"]
