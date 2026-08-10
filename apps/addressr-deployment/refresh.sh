#!/bin/sh

cd "$(dirname "$0")" || exit 1

# Routed through deploy.sh's passthrough branch rather than calling terraform
# directly.
#
# `aws_s3_object.elasticapp` now carries
# `source_hash = filemd5("${path.module}/deployment/package.json")`, and filemd5
# is evaluated during expression evaluation — on EVERY terraform command, refresh
# included, not only on plan/apply. `deployment/` is gitignored and generated, so
# a bare `terraform refresh` on a clean checkout fails with an
# invalid-function-argument error naming a file that no script visible from here
# creates. deploy.sh writes the manifest before both of its branches, so
# `deploy.sh refresh` lands in `terraform "$@"` with the file present.
#
# Failing loudly was the right call for the missing file (the alternative,
# `fileexists(...) ? ... : null`, fails OPEN and silently restores the blindness
# the hash closes). This keeps the operator path working without softening that.
exec ./deploy.sh refresh
