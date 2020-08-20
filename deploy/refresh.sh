#!/bin/sh

cd "$(dirname "$0")" || exit 1

./deploy.sh refresh
