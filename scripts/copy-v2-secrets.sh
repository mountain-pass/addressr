#!/usr/bin/env bash
# @jtbd JTBD-400 (Ship Releases Reliably From Trunk)
#
# scripts/copy-v2-secrets.sh
# ADR 029 Phase 1 secrets automation.
#
# Modes:
#   (default)         populate the V2-named GHA secrets after step 4 deploy.
#                     Reads endpoint from TFC remote state, creds from 1Password.
#   --target=canonical promote the V2 values into the canonical (v1-named)
#                     secrets at step 9b after the 7-day soak passes. Same
#                     data sources, different write target.
#   --cleanup         delete the V2-named GHA secrets at step 9d. Reads nothing;
#                     only deletes.
#
# Reads from: TFC remote state (terraform output, read-only) + 1Password (op read).
# Writes to:  GHA repo secrets via gh CLI.
# No values are printed to stdout, terminal, or shell history -- all flow
# through pipes via printf '%s' "$VAR" | gh secret set …
#
# Pre-conditions (operator-side):
#   - terraform login against the TFC org (read-only access is enough)
#   - op signin against the Voder vault
#   - gh auth status against mountain-pass/addressr
#
# 1Password path overrides via env: OP_USER_PATH / OP_PASS_PATH
# Repo override via env: REPO

set -euo pipefail

REPO="${REPO:-mountain-pass/addressr}"
OP_USER_PATH="${OP_USER_PATH:-op://Voder/addressr-elastic/username}"
OP_PASS_PATH="${OP_PASS_PATH:-op://Voder/addressr-elastic/password}"

MODE="default"
for arg in "$@"; do
  case "$arg" in
    --target=canonical) MODE="canonical" ;;
    --target=v2)        MODE="default" ;;
    --cleanup)          MODE="cleanup" ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument: $arg" >&2
      echo "Usage: $0 [--target=v2|canonical] [--cleanup]" >&2
      exit 2
      ;;
  esac
done

if [ "$MODE" = "cleanup" ]; then
  echo "Deleting V2-named GHA secrets in $REPO..."
  for secret in TF_VAR_ELASTIC_V2_HOST TF_VAR_ELASTIC_V2_USERNAME TF_VAR_ELASTIC_V2_PASSWORD; do
    if gh secret list --repo "$REPO" | grep -q "^$secret\b"; then
      gh secret delete "$secret" --repo "$REPO"
      echo "  Deleted $secret"
    else
      echo "  $secret not present (already cleaned up)"
    fi
  done
  echo "Done -- V2-named secrets cleared."
  exit 0
fi

# Default and --target=canonical both need the same read steps.

echo "Fetching v2 endpoint from Terraform Cloud (read-only)..."
V2_HOST="$(cd deploy && terraform output -raw 'module.opensearch_v2.endpoint')"
[ -n "$V2_HOST" ] || { echo "ERROR: terraform output returned empty endpoint" >&2; exit 1; }

echo "Fetching credentials from 1Password..."
V2_USER="$(op read "$OP_USER_PATH")"
V2_PASS="$(op read "$OP_PASS_PATH")"
[ -n "$V2_USER" ] && [ -n "$V2_PASS" ] || { echo "ERROR: 1P read failed (check op signin and OP_*_PATH env)" >&2; exit 1; }

if [ "$MODE" = "canonical" ]; then
  HOST_KEY="TF_VAR_ELASTIC_HOST"
  USER_KEY="TF_VAR_ELASTIC_USERNAME"
  PASS_KEY="TF_VAR_ELASTIC_PASSWORD"
  echo "Mode: canonical (promoting v2 values into v1-named secrets at step 9b)"
else
  HOST_KEY="TF_VAR_ELASTIC_V2_HOST"
  USER_KEY="TF_VAR_ELASTIC_V2_USERNAME"
  PASS_KEY="TF_VAR_ELASTIC_V2_PASSWORD"
  echo "Mode: default (populating V2-named secrets at step 4a)"
fi

echo "Setting GHA secrets in $REPO..."
printf '%s' "$V2_HOST" | gh secret set "$HOST_KEY" --repo "$REPO"
printf '%s' "$V2_USER" | gh secret set "$USER_KEY" --repo "$REPO"
printf '%s' "$V2_PASS" | gh secret set "$PASS_KEY" --repo "$REPO"

echo "Verifying secrets are set..."
for key in "$HOST_KEY" "$USER_KEY" "$PASS_KEY"; do
  if gh secret list --repo "$REPO" | grep -q "^$key\b"; then
    echo "  $key: OK"
  else
    echo "ERROR: $key not visible after set" >&2
    exit 1
  fi
done

echo "Done."
