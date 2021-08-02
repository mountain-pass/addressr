#!/bin/sh

: "${EC_API_KEY?The Elastic Cloud API Key is not set}"

curl -X PUT "https://api.elastic-cloud.com/api/v1/deployments/4d6e5196fbc14acca8b03a1b6d672fa7?hide_pruned_orphans=false&skip_snapshot=false&validate_only=false" \
    -H "Authorization: ApiKey $EC_API_KEY" \
    -H "Content-Type: application/json" \
    --data "@${1}"

STATUS=$(curl -s "https://api.elastic-cloud.com/api/v1/deployments/4d6e5196fbc14acca8b03a1b6d672fa7" \
    -H "Authorization: ApiKey $EC_API_KEY" | jq '.resources.elasticsearch[0].info.status' )

while [ $STATUS = '"reconfiguring"' ]
do
    echo $STATUS
    sleep 5
    STATUS=$(curl -s "https://api.elastic-cloud.com/api/v1/deployments/4d6e5196fbc14acca8b03a1b6d672fa7" \
        -H "Authorization: ApiKey $EC_API_KEY" | jq '.resources.elasticsearch[0].info.status' )
done

echo $STATUS
