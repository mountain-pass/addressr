#!/bin/bash
# Style Guide - UserPromptSubmit hook
# Detects STYLE-GUIDE.md in the project and injects delegation instruction.
# Mirrors: voice-tone-eval.sh

if [ -f "docs/STYLE-GUIDE.md" ]; then
  cat <<'HOOK_OUTPUT'
INSTRUCTION: MANDATORY STYLE GUIDE CHECK. YOU MUST FOLLOW THIS.
DETECTED: docs/STYLE-GUIDE.md exists in this project.

This is a NON-OPTIONAL instruction. You MUST use the style-guide-lead agent
before editing any .css or UI component file. This is proactive.
Do not wait for the user to ask.

REQUIRED ACTIONS:
1. Use the Agent tool to delegate to style-guide-lead
   (subagent_type: "style-guide-lead")
2. The style-guide-lead will review proposed styling against docs/STYLE-GUIDE.md
3. Do NOT write or edit styling without style-guide-lead review FIRST
4. Do NOT skip this step even if you think you can handle it yourself

SCOPE: All .css and UI component files (.html, .jsx, .tsx, .vue, .svelte, .ejs, .hbs).
Does NOT apply to: .ts/.js backend files, .md files, config files.
HOOK_OUTPUT
fi
