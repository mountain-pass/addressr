#!/bin/sh

export IMAGE=node:11.14.0-alpine

mkdir -p target/docker
cp ./scripts/run.sh target/docker/.
docker run -i -t -p 8080:8080 -u node -v "$PWD/target/docker:/mnt/addressr" $IMAGE sh -c "cd /mnt/addressr \
    && ./run.sh  @mountainpass/addressr"
