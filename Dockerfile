ARG BASE_IMAGE=node:11.14.0-alpine
FROM ${BASE_IMAGE}
ARG MAINTAINER
LABEL maintainer="${MAINTAINER}"
ARG USER=node
ARG PACKAGE
USER ${USER}

RUN apk add --no-cache \
    dumb-init
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

RUN mkdir -p "/home/${USER}/.npm"
RUN npm config set prefix "/home/${USER}/.npm"
RUN npm config get prefix

ARG PACKAGE
LABEL package="${PACKAGE}"
ARG VERSION
LABEL version="${VERSION}"

ARG PACKAGE_TGZ
COPY "${PACKAGE_TGZ}" "/tmp/${PACKAGE_TGZ}"
RUN npm install --prefer-offline --no-audit -g "/tmp/${PACKAGE_TGZ}"

ENV PATH="/home/${USER}/.npm/bin:$PATH"

ENV ELASTIC_PORT="9200"
ENV ELASTIC_HOST="host.docker.internal"
ENV ELASTIC_USERNAME=
ENV ELASTIC_PASSWORD=
ENV ELASTIC_PROTOCOL=

ENV ADDRESSR_INDEX_TIMEOUT="30s"
ENV ADDRESSR_INDEX_BACKOFF="1000"
ENV ADDRESSR_INDEX_BACKOFF_INCREMENT="1000"
ENV ADDRESSR_INDEX_BACKOFF_MAX="10000"

WORKDIR "/home/${USER}"

CMD "addressr-server"
