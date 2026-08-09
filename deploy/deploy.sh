#!/bin/sh

cd "$(dirname "$0")" || exit 1

# P095: resolve the version ONCE, here, and use it at every site below.
#
# All four consumers must agree or the deploy lies about itself: the tfvar
# drives main.tf's S3 `key` AND the EB application-version label, the manifest
# pins what EB installs, and the zip filename is what main.tf's `source` reads.
# Resolve only some of them and terraform labels the environment v3.1.0 while
# the bundle inside installs 3.0.8. `aws_s3_object.elasticapp` now carries a
# `source_hash` over the manifest (added 2026-08-09), so terraform CAN see a
# bundle disagreeing with its own name — but that is a backstop, not a licence
# to resolve the version more than once here. That silent identity
# lie would be worse than the loud failure P095 records. See resolve-version.sh
# for the publish-path/registry-path split.
deploy_version=$(./resolve-version.sh) || exit 1

# Same workspace-split fix as resolve-version.sh: npm_package_name is now the
# PRIVATE workspace root, so the manifest below would have pinned
# "addressr-workspace" — a package that does not exist on the registry.
deploy_pkg=$(node -e "console.log(require(require('path').resolve('../packages/addressr/package.json')).name)") || exit 1
: "${deploy_pkg:?could not read the published package name}"

tmpfile=$(mktemp --tmpdir=. XXXXXX.auto.tfvars)
trap "rm -f $tmpfile" 0 2 3 15

cat > "$tmpfile" <<- EOM
elasticapp         = "mountainpass-addressr"
elasticapp_version = "${deploy_version}"
EOM

# Rebuild the bundle directory from empty, every time.
#
# `mkdir -p` alone left whatever was already in here, and `zip` UPDATES an
# existing archive rather than replacing it — it adds and refreshes entries and
# leaves orphaned ones behind. On CI neither matters: the runner checks out
# fresh and both paths are gitignored. On an operator machine running the same
# `npm run deploy:prod` that reaches production, stale contents ride along into
# the bundle, and `aws_s3_object.elasticapp`'s `source_hash` cannot see them,
# because it hashes the manifest that goes IN rather than the archive that comes
# out. That is the one route where content-awareness makes things worse instead
# of better: a fresh, correct-looking hash over stale bytes.
rm -rf deployment
rm -f "mountainpass-addressr-deployment-${deploy_version}.zip"
mkdir -p deployment
cat > "deployment/package.json" <<- EOM
{
    "name": "${deploy_pkg}-deployment",
    "version": "${deploy_version}",
    "dependencies": {
        "${deploy_pkg}": "${deploy_version}"
    },
    "scripts": {
        "start": "addressr-server-2"
    }
}
EOM

{
    cd deployment || exit 1
    # npm i --production --ignore-scripts
    # `|| exit 1` is load-bearing: this script is #!/bin/sh with no `set -e`, so
    # an unchecked zip failure let terraform proceed and upload whatever was at
    # that path — previously nothing (fail-closed on the missing `source`), but
    # with a stale archive present it would upload stale bytes under a fresh
    # source_hash. Fail here instead.
    zip -9 -r ../mountainpass-addressr-deployment-"${deploy_version}".zip . || exit 1
    cd .. || exit 1
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
    # Honour an explicitly-exported TF_WORKSPACE so a plan-only run can target
    # the real workspace without being named deploy:<workspace>. Falls back to
    # the historical derivation, so deploy:prod / deploy:test are unchanged.
    TF_WORKSPACE="${TF_WORKSPACE:-${npm_lifecycle_event#deploy:}}"
    mkdir -p .terraform
    printf '%s' "$TF_WORKSPACE" > .terraform/environment
    # PLAN_ONLY must target a real workspace. Without this the fallback derives
    # "plan" from npm_lifecycle_event and the remote backend's addressr- prefix
    # targets addressr-plan, which does not exist - yielding either an error or,
    # worse, a full-create diff that reads like a real answer.
    if [ "${PLAN_ONLY:-}" = "1" ] && { [ -z "${TF_WORKSPACE}" ] || [ "${TF_WORKSPACE}" = "plan" ]; }; then
        echo "PLAN_ONLY requires an explicit TF_WORKSPACE (e.g. prod)." >&2
        exit 1
    fi
    # Never let `show` read a stale plan from a previous run.
    rm -f tfplan tfplan.json
    terraform init -input=false
    # if we output a plan in the release PR, we can review it
    # and apply it during the publish
    { terraform plan -refresh=true -input=false -detailed-exitcode -out=tfplan; retVal="$?"; } || true
    # PLAN_ONLY=1 stops here, BEFORE the apply branch below. Exists because
    # `terraform plan` cannot run on an operator machine - the root module needs
    # vars injected from GitHub Actions secrets - so no deploy/** change could be
    # pre-verified before the push that applied it.
    #
    # -detailed-exitcode: 0 = no changes, 1 = error, 2 = changes present. Only 1
    # is a failure. Exiting 2 here would fail the job in exactly the case this
    # exists for, and skip the caller's assertion step, which is the real verdict.
    if [ "${PLAN_ONLY:-}" = "1" ]; then
        [ "$retVal" -eq 1 ] && exit 1
        terraform show -json tfplan > tfplan.json || exit 1
        terraform show -no-color tfplan
        exit 0
    fi
    if [ $retVal -eq 2 ]; then
        { terraform apply -auto-approve -input=false; retVal="$?"; }
    fi
    exit $retVal    
else
    terraform "$@"
fi
