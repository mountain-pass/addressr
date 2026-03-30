---
name: c4-check
description: Check whether C4 architecture diagrams are up to date with source code
allowed-tools: Bash(node *)
---

Run the C4 check script to verify architecture diagrams are current:

```
node ${CLAUDE_SKILL_DIR}/scripts/c4-check.mjs
```

Report PASS or FAIL with details.

$ARGUMENTS
