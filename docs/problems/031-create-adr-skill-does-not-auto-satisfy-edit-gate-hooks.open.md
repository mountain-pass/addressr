# Problem 031: `wr-architect:create-adr` skill does not auto-satisfy the architect / JTBD edit-gate hooks

**Status**: Open
**Reported**: 2026-04-21
**Priority**: 4 (Low) — Impact: Negligible (1) x Likelihood: Likely (4)

## Description

The `wr-architect:create-adr` skill walks the user through drafting an ADR and then calls `Write` to create the file. Independently, the project enforces two `PreToolUse:Write` hooks on files under `docs/decisions/`:

- `architect-enforce-edit.sh` — blocks writes until a `wr-architect:agent` review marker has been dropped for the target filename.
- `jtbd-enforce-edit.sh` — blocks writes until a `wr-jtbd:agent` review marker has been dropped for the target filename.

The skill does **not** delegate to either agent before calling `Write`. The first write attempt is therefore always blocked, and the user must manually issue two `Agent` calls (architect + JTBD) before the skill can complete. For sessions that draft multiple sibling ADRs from a single decision context (e.g., ADR 029 + ADR 030 from one decision discussion), the unlock markers are filename-specific, so each additional ADR requires another two delegations. A two-ADR session pays four extra agent invocations.

This is friction, not failure — the hook chain works as designed and the architect review is genuinely valuable (it caught real issues in the ADR 029 draft on 2026-04-21). But the skill's own flow stops at the wrong step and the user has to know to fill the gap.

## Symptoms

- First `Write` attempt inside `wr-architect:create-adr` returns `BLOCKED: Cannot edit '<file>' without architecture review` from the architect hook.
- A second `Write` attempt (after architect runs) returns `BLOCKED: Cannot edit '<file>' without JTBD review` from the JTBD hook.
- Drafting N sibling ADRs in one session requires `2N` extra `Agent` invocations beyond what the skill itself does.
- The architect agent reviews **what is sent in the prompt**, so a hurried "review my plan" prompt that summarises the ADR (rather than including the full draft content) produces false-positive findings ("missing pros/cons section") that look like real review issues but are not. Fixing the prompt costs a second review cycle.

## Workaround

Manually delegate `wr-architect:agent` and `wr-jtbd:agent` for each ADR file **before** calling `Write` from inside the skill. Always include the full draft content in the prompt — never a summary. Repeat per file. Total cost per ADR: 2 extra `Agent` calls beyond what the skill performs.

## Impact Assessment

- **Who is affected**: Addressr Contributor/Maintainer persona (J7 — Ship releases reliably from trunk) when authoring ADRs. No end-user impact.
- **Frequency**: Every ADR write. Compounds linearly with the number of ADRs in a session — sibling-ADR sessions pay the worst overhead.
- **Severity**: Low — pure process friction. No production risk, no data loss, no incorrect output (the architect review still happens, just out-of-band from the skill).
- **Analytics**: N/A — tooling friction, not a measurable product event.

## Root Cause Analysis

### Why the skill does not delegate

`wr-architect:create-adr` is upstream code (windyroad plugin, vendored at `/Users/tomhoward/.claude/plugins/cache/windyroad/wr-architect/0.3.1/skills/create-adr`). The skill predates the addressr-side `architect-enforce-edit.sh` / `jtbd-enforce-edit.sh` hooks, so it has no knowledge that a `Write` to `docs/decisions/` will be gated. The skill's step 4 is "write the ADR file"; there is no step "delegate to wr-architect:agent first".

### Why the gap is not self-correcting

The hooks are project-level (addressr's CLAUDE.md / hook config), not plugin-level. The skill cannot know, at build time, which projects gate `docs/decisions/` writes — so a one-size-fits-all "always delegate" inside the skill would be wasteful in projects that don't gate.

### Investigation Tasks

- [x] Confirm the skill does not delegate before write _(2026-04-21 — verified by reading `/Users/tomhoward/.claude/plugins/cache/windyroad/wr-architect/0.3.1/skills/create-adr` and observing two `BLOCKED` responses during ADR 029 + 030 drafting)_
- [x] Confirm the unlock markers are filename-specific (not session-wide) _(2026-04-21 — observed during the same session: architect review of ADR 029 unlocked 029 only; ADR 030 required a second architect delegation)_
- [ ] Open an upstream issue / PR against `windyroad/wr-architect` with one of the proposed fix shapes (see Fix Strategy)
- [ ] Decide whether to add a project-level shim in the meantime (e.g., a `Skill` wrapper that auto-delegates) or accept the manual workaround

## Fix Strategy

Two viable upstream fix shapes for `wr-architect:create-adr`:

1. **Auto-delegate inside the skill, conditional on hook presence**: detect whether `architect-enforce-edit.sh` (or equivalent) is configured for `docs/decisions/` in the project's settings, and if so, delegate to `wr-architect:agent` (with the full draft content) before calling `Write`. Same for `wr-jtbd:agent`. Skip the delegation in projects without the hook to avoid waste.
2. **Always delegate, treat as a no-op in non-gated projects**: simpler — always delegate before write. The cost in non-gated projects is one extra `Agent` invocation per ADR. Acceptable if delegation is cheap.

Either fix would also benefit from an explicit instruction inside the skill: "When delegating an architect review for a draft, paste the full draft content into the prompt — not a summary."

In the meantime, the addressr-side workaround stands: manual delegation per file, always with full draft content.

## Related

- [ADR 029 — Two-phase blue/green upgrade off OpenSearch 1.3.20](../decisions/029-opensearch-blue-green-two-phase-upgrade.proposed.md) — first ADR drafted in the session that surfaced this problem (2026-04-21).
- [ADR 030 — OpenSearch domain under Terraform](../decisions/030-opensearch-domain-terraform-module.proposed.md) — sibling ADR; required the second pair of delegations that exposed the per-file unlock pattern.
- `docs/BRIEFING.md` — bullet under "What Will Surprise You" updated 2026-04-21 to capture the per-file marker behaviour and the "send the actual draft, not a summary" lesson.
- Upstream skill: `/Users/tomhoward/.claude/plugins/cache/windyroad/wr-architect/0.3.1/skills/create-adr` (and `/Users/tomhoward/.claude/plugins/cache/windyroad/wr-architect/0.3.1/agents/wr-architect.md`).
- Upstream hook scripts (project-side): `${CLAUDE_PLUGIN_ROOT}/hooks/architect-enforce-edit.sh`, `${CLAUDE_PLUGIN_ROOT}/hooks/jtbd-enforce-edit.sh`.
- [Problem P024 — Architect agent misses performance implications](024-architect-agent-misses-performance-implications.parked.md) — different concern (review quality, not hook integration); listed for proximity only.
