# Context Analysis — 2026-07-19

> Source: `/wr-retrospective:analyze-context` (deep layer per ADR-043).
> Methodology: byte-count-on-disk + per-plugin decomposition (cache-fallback mode — adopter repo, no `packages/` source tree).
> Cheap-layer baseline: `wr-retrospective-measure-context-budget` shim.
> Prior snapshot: `docs/retros/2026-07-15-context-analysis.md`.

**Headline caveat (ADR-026 grounding):** byte-count-on-disk is a proxy, not per-session-injected cost. Two buckets over-count badly — see the `memory` and `briefing` rows and the Suggestions. Treat on-disk totals as an upper bound on what _could_ enter context, not what _does_.

## Bucket Totals

Measured repo-bucket total: **1,366,159 bytes** (Δ **+81,453** vs 2026-07-15's 1,284,706 — this session's ticket + ADR additions).

| Bucket             | Bytes                                                                                               | % of measured | Δ vs prior (07-15) |
| ------------------ | --------------------------------------------------------------------------------------------------- | ------------- | ------------------ |
| memory             | 587,653                                                                                             | 43.0%         | +2,750             |
| problems           | 427,378                                                                                             | 31.3%         | +56,829            |
| decisions          | 319,344                                                                                             | 23.4%         | +21,414            |
| jtbd               | 24,565                                                                                              | 1.8%          | +460               |
| project-claude-md  | 7,219                                                                                               | 0.5%          | 0                  |
| hooks              | not-measured (bucket layer: `source-absent`) — see per-plugin: **550,270**                          | —             | 0                  |
| skills             | not-measured (bucket layer: `source-absent`) — see per-plugin: **1,321,795**                        | —             | 0                  |
| briefing           | bucket layer: `source-absent` — but `docs/BRIEFING.md` exists at **33,618 bytes** (measurement gap) | —             | not measured prior |
| framework-injected | not measured — no on-disk source                                                                    | —             | —                  |

## Per-Plugin Decomposition

### Hooks (aggregate 550,270 bytes)

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

### Skills (aggregate 1,321,795 bytes)

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

| Surface                                          | Bytes   | Bucket         | Comparable prior                                                         |
| ------------------------------------------------ | ------- | -------------- | ------------------------------------------------------------------------ |
| `wr-itil/skills/work-problems/SKILL.md`          | 245,245 | skills/wr-itil | P097 (SKILL.md size cluster); ADR-054 (SKILL.md runtime-budget)          |
| `memory` bucket (on-disk)                        | 587,653 | memory         | not estimated — no prior data (see caveat: only MEMORY.md ~3.2 KB loads) |
| `docs/problems/` (README + 55 tickets + history) | 427,378 | problems       | P062/P094 (README render bounds the loaded surface)                      |
| `docs/decisions/` (36 ADRs + compendium)         | 319,344 | decisions      | ADR-077 (compendium is the loaded surface; ADRs load on demand)          |
| `wr-itil` hooks (governance gates every prompt)  | 186,354 | hooks/wr-itil  | not estimated — no prior data                                            |

## Per-Turn Attribution

per-turn attribution: not measured — no per-turn session log accessible. The `.afk-run-state/*.jsonl` files present (`outstanding-questions.jsonl`, `risk-register-queue.jsonl`) are queue state, not per-turn `usage` logs.

## Suggestions

1. **skills/wr-itil — `work-problems/SKILL.md` (245,245 bytes, a 5× P097 breach).** Upstream surface — an adopter cannot trim it, and it only enters context when `/wr-itil:work-problems` is actually invoked (it did not load this session). Actionable path is upstream via the ADR-054 SKILL.md runtime-budget policy (progressive disclosure / REFERENCE.md split). Estimated local byte saving: **not estimated — no prior data** (not locally reclaimable).
2. **memory bucket over-count (measurement gap, not a trim target).** The bucket reports 587,653 bytes, but the per-session-loaded surface is `MEMORY.md` alone at **3,179 bytes** (19 individual memory files, 76 KB total, load only on recall). On-disk over-attributes the memory bucket ~185× vs actual per-session cost. No trim warranted; flag the measurement method. Estimated saving from trimming memory: **not estimated — no prior data** (would not reduce per-session context).
3. **briefing measurement gap.** The bucket layer emitted `briefing source-absent`, but `docs/BRIEFING.md` (**33,618 bytes**) exists and IS the SessionStart-loaded surface — so real per-session briefing cost is unmeasured by the cheap layer in this adopter. If it grows, the P100 pattern (split `BRIEFING.md` into per-topic `docs/briefing/` files + Tier-3 rotation) applies. Estimated saving: **not estimated — no prior data** (BRIEFING is single-file and within Tier envelope today).

## Policy Breaches

| Budget                                                 | Offender                                                                  | Bytes                 | Citation                                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------- |
| P097 SKILL.md >50 KB                                   | `wr-itil/0.59.1/skills/work-problems/SKILL.md`                            | 245,245               | ADR-038 / P097 SKILL.md size cluster (upstream wr-itil)                                |
| ADR-038 hook prose ≤150 B (subsequent-prompt reminder) | `accessibility-agents` UserPromptSubmit reminder (fires ~2× every prompt) | ~1,500 (per fire, ×2) | ADR-038 hook prose budget — non-windyroad plugin; observation only, not addressr-owned |

Note: `check-briefing-budgets.sh` (ADR-040 tiers) not run — no `docs/briefing/` tree in this adopter (single-file `docs/BRIEFING.md`). ADR-038 hook-prose breach is in the user's global `accessibility-agents` setup, outside addressr's control.

<!--
context-snapshot:
  total-bytes: 1366159
  hooks: 550270
  skills: 1321795
  memory: 587653
  briefing: 33618
  decisions: 319344
  problems: 427378
  jtbd: 24565
  project-claude-md: 7219
  framework-injected: not measured
  measurement-method: byte-count-on-disk
  measured-at: 2026-07-18T22:22:19Z
-->
