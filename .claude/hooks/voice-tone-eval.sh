#!/bin/bash
# Voice & Tone - UserPromptSubmit hook
# Detects VOICE-AND-TONE.md in the project and injects delegation instruction.
# Mirrors: a11y-team-eval.sh

if [ -f "docs/VOICE-AND-TONE.md" ]; then
  cat <<'HOOK_OUTPUT'
INSTRUCTION: MANDATORY VOICE & TONE CHECK. YOU MUST FOLLOW THIS.
DETECTED: docs/VOICE-AND-TONE.md exists in this project.

This is a NON-OPTIONAL instruction. You MUST use the voice-and-tone-lead agent
before editing any user-facing copy in HTML, JSX, template, or component files.
This is proactive. Do not wait for the user to ask.

REQUIRED ACTIONS:
1. Use the Agent tool to delegate to voice-and-tone-lead
   (subagent_type: "voice-and-tone-lead")
2. The voice-and-tone-lead will review proposed copy against docs/VOICE-AND-TONE.md
3. Do NOT write or edit copy without voice-and-tone-lead review FIRST
4. Do NOT skip this step even if you think you can handle it yourself

SCOPE: User-facing files (.html, .jsx, .tsx, .vue, .svelte, .ejs, .hbs).
Does NOT apply to: .css files, .ts/.js backend files, config files.
HOOK_OUTPUT
fi
