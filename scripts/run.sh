#!/bin/sh

# Invoked only by scripts/run-in-docker.sh and scripts/run-in-docker-from-npm.sh, which
# mount this script into a stock node image. It is NOT used by the published
# ghcr.io/mountain-pass/addressr image, which since ADR-039 is Distroless and has no shell.

mkdir /home/node/.npm
npm config set prefix /home/node/.npm
npm install -g $*
export PATH="/home/node/.npm/bin:$PATH"

ls /home/node/.npm/bin
which addressr-server-2

hostip=`ip route show | awk '/default/ {print $3}'`
echo $hostip

export ELASTIC_PORT="9200"
export ELASTIC_HOST="$hostip"

DEBUG=error,api,express:*,test,es addressr-server-2
