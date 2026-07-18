# Problem 056: wr-itil SKILL.md bodies exceed the ADR-054 runtime budget (work-problems 245KB)

**Status**: Open
**Reported**: 2026-07-18
**Priority**: 4 (Low) — Impact: 2 (Minor — per-invocation context cost on the calling agent; no defect) × Likelihood: 2 (Unlikely to bite per session — large skills load on demand) — derived at capture
**Origin**: internal (upstream plugin context-budget)
**Effort**: M — upstream fix (REFERENCE.md split per ADR-054 / ADR-038)
**WSJF**: 2.0
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

wr-itil skills total ~984 KB on disk, dominated by `skills/work-problems/SKILL.md` at 245,245 bytes (~5x the P097 50 KB SKILL.md-size anchor). ADR-054 (SKILL.md runtime-budget) + ADR-038 (progressive disclosure) prescribe a lean SKILL.md + lazy REFERENCE.md split, but the largest skills have not been split. Every invocation injects the full SKILL.md into the calling agent context in one turn. Surfaced by the 2026-07-18 `/wr-retrospective:analyze-context` run (docs/retros/2026-07-19-context-analysis.md): wr-itil skills = 76.3% of all measured plugin skill bytes.

## Symptoms

- Invoking a large wr-itil skill (work-problems, manage-problem, capture-problem) injects a very large SKILL.md into context in a single turn.
- wr-itil skills are the dominant on-disk plugin surface (1,008,146 bytes).

## Workaround

Invoke large skills only when needed (on-demand load, not per-session). No adopter-side trim possible — the SKILL.md bodies ship in the plugin.

## Root Cause Analysis

**Confirmed 2026-07-18.** ADR-054 / ADR-038 / P097 are the governing upstream policy; the largest skill bodies breach it. Upstream fix: apply the REFERENCE.md split to work-problems, manage-problem, capture-problem first (biggest wins).

### Investigation Tasks

- [x] Measure per-skill byte counts — done (analyze-context 2026-07-18; work-problems/SKILL.md 245,245 bytes)

## Dependencies

- **Blocks**: (none)
- **Blocked by**: upstream — fix lives in the `wr-itil` plugin, not this repo

## Related

- Surfaced by `docs/retros/2026-07-19-context-analysis.md` (Top-N offenders + P097 breach row).
- **Reported upstream**: https://github.com/windyroad/agent-plugins/issues/367 (2026-07-18)

## Reported Upstream

- **URL**: https://github.com/windyroad/agent-plugins/issues/367
- **Reported**: 2026-07-18
- **Template used**: problem-report.yml (problem-shaped structured body)
- **Disclosure path**: public issue
- **Cross-reference confirmed**: yes (issue body records the P056 downstream reference)
