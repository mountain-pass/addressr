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

# ADR 032 / P042: bundle the Cloudflare Worker (esbuild) before any terraform
# command. cloudflare_workers_script.content reads worker.bundled.js; the v5
# provider takes a single content string, so worker.js's local imports
# (./ip-matcher.mjs, ./safe-ips.mjs) must be bundled into one file first. Run
# from the repo root (this script has cd'd into deploy/) so the npm script's
# relative paths resolve. The bundle is gitignored — derived fresh each run
# from the same source the unit tests import, so it cannot drift.
( cd .. && npm run build:worker )

if test -z "$*"; then
    set -x
    TF_WORKSPACE="${npm_lifecycle_event#deploy:}"
    mkdir -p .terraform
    printf '%s' "$TF_WORKSPACE" > .terraform/environment
    terraform init -input=false
    # if we output a plan in the release PR, we can review it
    # and apply it during the publish
    { terraform plan -refresh=true -input=false -detailed-exitcode; retVal="$?"; } || true
    if [ $retVal -eq 2 ]; then
        { terraform apply -auto-approve -input=false; retVal="$?"; }
    fi
    exit $retVal    
else
    terraform "$@"
fi
