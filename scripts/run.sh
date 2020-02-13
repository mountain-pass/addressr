#!/bin/sh

mkdir /home/node/.npm
npm config set prefix /home/node/.npm
npm install -g $*
export PATH="/home/node/.npm/bin:$PATH"

ls /home/node/.npm/bin
which addressr-server

hostip=`ip route show | awk '/default/ {print $3}'`
echo $hostip

export ELASTIC_PORT="9200"
export ELASTIC_HOST="$hostip"

DEBUG=error,api,express:*,swagger-tools*,test,es addressr-server
