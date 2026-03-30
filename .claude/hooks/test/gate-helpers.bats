#!/usr/bin/env bats
# Tests for .claude/hooks/lib/gate-helpers.sh

setup() {
  HOOKS_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)"
  source "$HOOKS_DIR/lib/gate-helpers.sh"
}

@test "_mtime returns numeric value for existing file" {
  tmpfile=$(mktemp)
  result=$(_mtime "$tmpfile")
  rm -f "$tmpfile"
  [[ "$result" =~ ^[0-9]+$ ]]
  [ "$result" -gt 0 ]
}

@test "_mtime returns 0 for nonexistent file" {
  result=$(_mtime "/tmp/nonexistent-bats-test-$$")
  [ "$result" = "0" ]
}

@test "_hashcmd produces consistent hash for same input" {
  hash1=$(echo "test input" | _hashcmd | cut -d' ' -f1)
  hash2=$(echo "test input" | _hashcmd | cut -d' ' -f1)
  [ "$hash1" = "$hash2" ]
}

@test "_hashcmd produces different hash for different input" {
  hash1=$(echo "input one" | _hashcmd | cut -d' ' -f1)
  hash2=$(echo "input two" | _hashcmd | cut -d' ' -f1)
  [ "$hash1" != "$hash2" ]
}

@test "_doc_exclusions returns expected patterns" {
  result=$(_doc_exclusions)
  [[ "$result" == *":!docs/"* ]]
  [[ "$result" == *":!.risk-reports/"* ]]
  [[ "$result" == *":!.changeset/"* ]]
  [[ "$result" == *":!governance/"* ]]
  [[ "$result" == *":!.claude/plans/"* ]]
  [[ "$result" == *":!CLAUDE.md"* ]]
}

@test "_doc_exclusions does not exclude RISK-POLICY.md" {
  result=$(_doc_exclusions)
  [[ "$result" != *"RISK-POLICY"* ]]
}

@test "_doc_exclusions does not exclude package.json" {
  result=$(_doc_exclusions)
  [[ "$result" != *"package.json"* ]]
}
