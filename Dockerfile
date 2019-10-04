ARG BASE_IMAGE=node:11.14.0-alpine
FROM ${BASE_IMAGE}
LABEL maintainer="addressr@mountain-pass.com.au"
ARG USER=node
ARG PACKAGE
USER ${USER}

RUN mkdir -p "/home/${USER}/.npm"
RUN npm config set prefix "/home/${USER}/.npm"
RUN npm config get prefix
RUN npm install -g "${PACKAGE}"
ENV PATH="/home/${USER}/.npm/bin:$PATH"

ENV ELASTIC_PORT="9200"
ENV ELASTIC_HOST="host.docker.internal"
ENV MONGO_USERNAME="root"
ENV MONGO_PASSWORD="example"
ENV MONGO_URL="mongodb://host.docker.internal:27017"

WORKDIR "/home/${USER}"

CMD "addressr-server"
