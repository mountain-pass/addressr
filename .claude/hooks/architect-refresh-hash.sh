#!/bin/bash
# Architecture - PostToolUse hook for Edit/Write
# Refreshes the stored decision hash after an allowed write to docs/decisions/.
# This prevents drift detection from invalidating the marker when creating
# new decision files that the architect just approved.

# Portable hash: tries md5sum, falls back to md5 -r, then shasum
_hashcmd() { md5sum 2>/dev/null || md5 -r 2>/dev/null || shasum 2>/dev/null; }

INPUT=$(cat)

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty') || true
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty') || true

if [ -z "$SESSION_ID" ] || [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Only act on writes to docs/decisions/
case "$FILE_PATH" in
  */docs/decisions/*|docs/decisions/*)
    ;;
  *)
    exit 0
    ;;
esac

MARKER="/tmp/architect-reviewed-${SESSION_ID}"
HASH_FILE="/tmp/architect-reviewed-${SESSION_ID}.hash"

# Only refresh if a valid marker exists
if [ -f "$MARKER" ] && [ -f "$HASH_FILE" ]; then
  if [ -d "docs/decisions" ]; then
    HASH=$(find docs/decisions -name '*.md' -not -name 'README.md' -print0 | sort -z | xargs -0 cat 2>/dev/null | _hashcmd | cut -d' ' -f1)
  else
    HASH="none"
  fi
  echo "$HASH" > "$HASH_FILE"
fi

exit 0
