#! /bin/sh



IMAGE="wata727/tflint:0.16.1"
alias tflint='docker run -i -t -e TFLINT_LOG=debug --rm -v ${PWD}:/workdir --workdir /workdir ${IMAGE}'

if test -z "$*"; then
    mkdir -p build
    tflint --module --format=json --config=/workdir/.tflint.hcl /workdir/deploy 
else
    tflint "$@"
fi

