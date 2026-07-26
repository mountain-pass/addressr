# Multi-stage build for the published mountainpass/addressr image (ADR-039).
# The build stage installs the packed tarball globally with npm; the runtime stage is
# Distroless, which has no shell, no package manager and no npm. The build and runtime
# images are both Debian 12 so the two stages share a libc.
ARG BUILD_IMAGE=node:22-bookworm-slim
ARG RUNTIME_IMAGE=gcr.io/distroless/nodejs22-debian12:nonroot

FROM ${BUILD_IMAGE} AS build

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

# The Distroless nodejs ENTRYPOINT is already ["/nodejs/bin/node"], so node runs as
# PID 1 and dumb-init is no longer needed. CMD is the resolved script path rather than
# the addressr-server-2 bin shim: there is no shell and no /usr/bin/env to resolve it.
# The loader is invoked the same way, but needs a writable cwd: GNAF_DIR relocates
# the G-NAF download, and the CKAN package cache at target/keyv-file.msgpack has no
# env override, so mount over the whole target directory rather than just GNAF_DIR.
# The loader therefore cannot run with --read-only, unlike the server.
#   docker run -v "$PWD/target:/home/nonroot/target" mountainpass/addressr \
#     /opt/addressr/lib/node_modules/@mountainpass/addressr/lib/bin/addressr-loader.js
CMD ["/opt/addressr/lib/node_modules/@mountainpass/addressr/lib/bin/addressr-server-2.js"]
