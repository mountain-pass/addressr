# Context Analysis — 2026-07-15

> Source: `/wr-retrospective:analyze-context` (deep layer per ADR-043), auto-fired from run-retro Step 2c (calendar-elapse trigger — no prior report existed in this project).
> Methodology: byte-count-on-disk + per-plugin decomposition (cache-fallback mode — adopter repo, no `packages/` tree).
> Cheap-layer baseline: `wr-retrospective-measure-context-budget` (ADR-049 shim).

## Bucket Totals

No prior snapshot — first measurement this project (Δ column omitted per ADR-026 `not estimated — no prior data`).

| Bucket             | Bytes                                                                                                                                                | % of measured |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| memory             | 584,903                                                                                                                                              | 45.5%         |
| problems           | 370,549                                                                                                                                              | 28.8%         |
| decisions          | 297,930                                                                                                                                              | 23.2%         |
| jtbd               | 24,105                                                                                                                                               | 1.9%          |
| project-claude-md  | 7,219                                                                                                                                                | 0.6%          |
| hooks              | not-measured (source-absent at repo path; see Per-Plugin Decomposition for cache-resolved totals)                                                    | —             |
| skills             | not-measured (source-absent at repo path; see Per-Plugin Decomposition for cache-resolved totals)                                                    | —             |
| briefing           | not-measured (source-absent — legacy single-file `docs/BRIEFING.md`, no `docs/briefing/` tree; migration path: `/wr-retrospective:migrate-briefing`) | —             |
| framework-injected | not measured (framework-injected-no-on-disk-source)                                                                                                  | —             |

Measured total (cheap-layer buckets): **1,284,706 bytes**.

**Measurement anomaly (flagged for upstream)**: the script reports `memory bytes=584903`, but `du -sk` of the memory directory (`~/.claude/projects/-Users-tomhoward-Projects-addressr/memory/`, 17 files) shows ~68 KB. The script's memory-bucket scope appears to include more than the memory directory in adopter layouts. Do not treat the 584,903 figure as trim-actionable until the scope is confirmed.

## Per-Plugin Decomposition

Resolved via cache-fallback mode (`wr-retrospective-list-plugin-attribution`, plugin-cache `bin/` sniffing).

### Hooks (sum: 550,270 bytes)

| Plugin               | Bytes   | % of hooks |
| -------------------- | ------- | ---------- |
| wr-itil              | 186,354 | 33.9%      |
| wr-risk-scorer       | 118,484 | 21.5%      |
| wr-architect         | 72,880  | 13.2%      |
| wr-voice-tone        | 64,781  | 11.8%      |
| wr-jtbd              | 43,389  | 7.9%       |
| wr-style-guide       | 27,801  | 5.1%       |
| wr-retrospective     | 21,818  | 4.0%       |
| wr-cruise            | 14,315  | 2.6%       |
| ponytail             | 448     | 0.1%       |
| accessibility-agents | 0       | 0%         |

### Skills (sum: 1,321,795 bytes)

| Plugin           | Bytes     | % of skills |
| ---------------- | --------- | ----------- |
| wr-itil          | 1,008,146 | 76.3%       |
| wr-retrospective | 118,136   | 8.9%        |
| wr-risk-scorer   | 74,674    | 5.6%        |
| wr-architect     | 67,938    | 5.1%        |
| wr-jtbd          | 21,702    | 1.6%        |
| ponytail         | 15,500    | 1.2%        |
| wr-voice-tone    | 10,473    | 0.8%        |
| wr-style-guide   | 3,895     | 0.3%        |
| wr-cruise        | 1,331     | 0.1%        |

## Top-N Offenders

| Surface                                           | Bytes     | Bucket         | Comparable prior                                                                                        |
| ------------------------------------------------- | --------- | -------------- | ------------------------------------------------------------------------------------------------------- |
| `wr-itil/0.59.0/skills/work-problems/SKILL.md`    | 244,041   | skills/wr-itil | P097 SKILL.md size cluster (50 KB anchor) — 4.9× over                                                   |
| wr-itil skills corpus (all SKILL.md)              | 1,008,146 | skills/wr-itil | ADR-054 runtime-budget policy; P362 grep-precheck pattern                                               |
| memory (script-reported; see anomaly note)        | 584,903   | memory         | not estimated — measurement scope unconfirmed                                                           |
| problems corpus (`docs/problems/`, incl. closed)  | 370,549   | problems       | P134/P331 README rotation already bounds the loaded surface; closed tickets are on-disk, not in-context |
| decisions corpus (`docs/decisions/` + compendium) | 297,930   | decisions      | not estimated — no prior data                                                                           |

## Per-Turn Attribution

per-turn attribution: not measured — no session log accessible (`.afk-run-state/*.jsonl` here are queue files — `outstanding-questions.jsonl`, `risk-register-queue.jsonl` — not turn logs with `usage` fields).

## Suggestions

1. **skills/wr-itil — `work-problems/SKILL.md` (244,041 bytes)** — the single largest context surface any wr-itil skill invocation can load; every AFK loop iteration that re-enters it pays the full load. This is an upstream `@windyroad/itil` surface, not addressr-owned — route as an upstream observation (`/wr-itil:report-upstream` candidate) rather than a local trim. Comparable prior: P362 reclaimed ~14 KB/transition by grep-gating the update-upstream dispatch; ADR-054 names the SKILL.md runtime-budget policy. Estimated byte saving: not estimated — upstream owns the split shape.
2. **memory bucket (script-reported 584,903 bytes vs ~68 KB on disk)** — confirm the measurement scope of `measure-context-budget.sh`'s memory bucket in adopter layouts before acting; a mis-scoped bucket makes every future delta-trigger evaluation unreliable (it gates the 20%/10 KB auto-fire axis). Comparable prior: not estimated — no prior data. Upstream `@windyroad/retrospective` observation.
3. **briefing bucket not-measured** — this repo still runs the legacy single-file `docs/BRIEFING.md` (~9.4 KB, 80 lines); the measurement (and the Tier 3 rotation machinery) only sees `docs/briefing/`. Running `/wr-retrospective:migrate-briefing` would bring the briefing surface under measurement + rotation. Comparable prior: P100 split BRIEFING.md into per-topic files (source repo). Estimated byte saving: none direct — enables future rotation.

## Policy Breaches

| Budget                                             | Offender                                                                                    | Bytes   | Citation                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------- |
| ADR-038 SKILL.md size cluster (P097, 50 KB anchor) | `wr-itil/0.59.0/skills/work-problems/SKILL.md`                                              | 244,041 | `find ~/.claude/plugins/cache/windyroad -name SKILL.md -size +50k` 2026-07-15; upstream surface |
| ADR-040 Tier 3 briefing budgets                    | not measured — `wr-retrospective-check-briefing-budgets` shim absent in adopter repo (P049) | —       | shim lookup 2026-07-15                                                                          |

<!--
context-snapshot:
  total-bytes: 1284706
  hooks: 550270
  skills: 1321795
  memory: 584903
  briefing: not measured
  decisions: 297930
  problems: 370549
  jtbd: 24105
  project-claude-md: 7219
  framework-injected: not measured
  measurement-method: byte-count-on-disk
  measured-at: 2026-07-15T09:15:41Z
-->
