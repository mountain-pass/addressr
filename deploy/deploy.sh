#!/bin/sh

cd "$(dirname "$0")" || exit 1

tmpfile=$(mktemp --tmpdir=. XXXXXX.auto.tfvars)
trap "rm -f $tmpfile" 0 2 3 15

cat > "$tmpfile" <<- EOM
elasticapp         = "mountainpass-addressr"
elasticapp_version = "${npm_package_version:?required}"
EOM

mkdir -p deployment
cat > "deployment/package.json" <<- EOM
{
    "name": "${npm_package_name:?required}-deployment",
    "version": "${npm_package_version}",
    "dependencies": {
        "${npm_package_name:?required}": "${npm_package_version:?required}"
    },
    "scripts": {
        "start": "addressr-server-2"
    }
}
EOM

{ 
    cd deployment || exit
    # npm i --production --ignore-scripts
    zip -9 -r ../mountainpass-addressr-deployment-"${npm_package_version:?required}".zip .
    cd ..

}

if test -z "$*"; then
    terraform workspace select "${npm_lifecycle_event#deploy:}"
    terraform init -input=false 
    # if we output a plan in the release PR, we can review it
    # and apply it during the publish
    { terraform plan -refresh=true -input=false -detailed-exitcode; retVal="$?"; } || true
    if [ $retVal -eq 2 ]; then
        {  echo terraform apply -auto-approve -input=false; retVal="$?"; }
    fi
    exit $retVal    
else
    echo terraform "$@"
fi
