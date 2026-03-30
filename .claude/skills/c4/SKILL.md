---
name: c4
description: Regenerate C4 architecture diagrams (C3 component + C4 code views) from source code
allowed-tools: Bash(node *)
---

Run the C4 generator script to regenerate architecture diagrams from source code:

```
node ${CLAUDE_SKILL_DIR}/scripts/c4-generate.mjs
```

Report what files changed. Do not commit.

$ARGUMENTS
