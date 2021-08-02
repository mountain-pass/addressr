#!/bin/sh

finish() {
    deploy/adjust-elastic-search-cluster.sh deploy/decrease-elastic-search-cluster.json 
}
trap finish EXIT

deploy/adjust-elastic-search-cluster.sh deploy/increase-elastic-search-cluster.json 

npm run start:loader:geo:prod

