---
name: ai-assistant-user
description: Uses addressr through MCP integration in Claude, Cursor, VS Code Copilot, or similar AI tools.
---

# AI Assistant User

## Who

Uses addressr through MCP integration in Claude, Cursor, VS Code Copilot, or similar AI tools. Needs address lookup grounded in authoritative data during AI-assisted workflows.

## Context Constraints

- Calls addressr via MCP tools rather than HTTP/REST directly
- Queries are natural-language phrased; the tool must translate them into structured search
- Results are consumed by an LLM — structured, reliable shapes matter more than presentational formats
- Token budget pressure: replies should be concise but complete

## Pain Points

- AI hallucinating addresses that don't exist
- MCP tools returning verbose, unstructured prose instead of typed results
- Tools that fail silently without telling the LLM what to retry

## Jobs

This persona is a secondary participant on **JTBD-001 (Search and autocomplete)** and **JTBD-002 (Look up localities, postcodes, and states)** — see those job files for shared outcomes. No persona-exclusive jobs are documented today.
