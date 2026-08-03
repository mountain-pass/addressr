# Git Staging Traps and Agent I/O Shapes

How commits lose content, and the literal shapes agent/hook plumbing expects. Split out of `agent-and-workflow-patterns.md` 2026-08-04 (Tier-3 budget).

## What You Need to Know

- **A compound `git add X && git commit` loses the add TWICE over, and the second way is newer than the memory.** The documented variant is: gate blocks the commit, you rescore, retry a plain `git commit`, and it ships pre-edit text. The variant hit three times on 2026-08-03 is simpler and worse — when the gate denies the compound invocation, **the `git add` never ran at all**, so the retry commits whatever was already staged (often nothing, or an unrelated earlier file). One commit landed carrying a single hook-staged file while its message described eight. Always issue `git add` as its own Bash call before the commit call, and after any gate-blocked retry run `git show --stat HEAD` AND `git diff HEAD -- <files>`.
  <!-- signal-score: 2 | last-classified: 2026-08-04 | first-written: 2026-08-04 -->
- **P011 was misdiagnosed and is now a Known Error with corrected cause.** The ef66d39 release-without-version-bump was NOT lint-staged dropping the changeset — literal replay with the same lint-staged 16.4.0 + same fileset retains `.changeset/*.md` (matches via `*.md` basename pattern, prettier re-stages). Real cause: the changeset was never staged before commit (likely `git add -u` or a miss). Guardrail: `git show --stat HEAD | grep .changeset/` after any release-intent commit + regression test at `test/precommit/changeset-preservation.test.mjs`.
- **PostToolUse hook input for Agent provides `tool_response`** (a dict with `content` array of `{type, text}` objects), NOT `tool_output`. Use `tool_response.content[].text` to read agent output in hooks.
- **Risk scorer agents have no Bash tool** — they output structured markers (`RISK_SCORES:`, `RISK_VERDICT:`, `RISK_BYPASS:`) and `risk-score-mark.sh` PostToolUse hook writes all score files deterministically. Never write score files directly.
