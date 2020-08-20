#!/bin/sh

cd "$(dirname "$0")" || exit 1

if test -z "${LOCAL_TF_CLI_CONFIG_FILE}"; then
    LOCAL_TF_CLI_CONFIG_FILE=$HOME/.terraformrc
fi
echo "credentials \"app.terraform.io\" { token=\"${TERRAFORM_TOKEN}\" }" > "${LOCAL_TF_CLI_CONFIG_FILE}"
LOCAL_TF_CLI_CONFIG_FILE_DIR="$( cd "$(dirname "$LOCAL_TF_CLI_CONFIG_FILE")" ; pwd -P )"

DEPLOY_DIR=$(pwd)

alias terraform="docker run -i -t \
    -v $DEPLOY_DIR:/workingdir -w /workingdir \
    -v $LOCAL_TF_CLI_CONFIG_FILE_DIR:/root \
    -v $DIGITALOCEAN_PVT_KEY_DIR:$DIGITALOCEAN_PVT_KEY_DIR \
    -v $DIGITALOCEAN_PUB_KEY_DIR:$DIGITALOCEAN_PUB_KEY_DIR \
    -e TF_IN_AUTOMATION=1 \
    -e TF_LOG \
    mountainpass/terraform-runner:1.2.0 \
    " 

export TF_WS="${TF_WS:=dev}"

for file in ./templates/*; do
    if test -f "$file"; then
        BASE=$(basename "$file")
        < "$file" envsubst > ./resolved_${BASE}
    fi
done

terraform workspace select "${TF_WS}" || terraform workspace new ${TF_WS}

if test -z "$*"; then
    terraform init # -get-plugins=false -verify-plugins=false 
    terraform plan -refresh=true -input=false -out=plan.out 
    terraform apply -auto-approve plan.out 
else
    terraform "$@"
fi
