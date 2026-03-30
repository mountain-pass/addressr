#!/bin/bash
# Architecture - Stop hook
# Removes the architect session marker so the next turn requires a fresh review.
# Mirrors: voice-tone-reset-marker.sh

INPUT=$(cat)

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty') || true

if [ -n "$SESSION_ID" ]; then
  rm -f "/tmp/architect-reviewed-${SESSION_ID}"
  rm -f "/tmp/architect-reviewed-${SESSION_ID}.hash"
fi

exit 0
