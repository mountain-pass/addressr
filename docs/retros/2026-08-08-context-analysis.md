# Context Analysis — 2026-08-08

> Source: `/wr-retrospective:analyze-context` (deep layer per ADR-043).
> Methodology: byte-count-on-disk via `wr-retrospective-measure-context-budget` + per-plugin decomposition via `wr-retrospective-list-plugin-attribution`.
> Auto-fired from run-retro Step 2c on the delta axis: two buckets cleared both the 20% and the 10 KB floor. Calendar-elapse did not fire (6 days since 2026-08-02, threshold 14).

## Bucket Totals

Measured total: **2,418,521 bytes**. Prior snapshot 2026-08-02.

| Bucket            | Bytes     | % of measured | Δ vs prior                        |
| ----------------- | --------- | ------------- | --------------------------------- |
| problems          | 1,034,828 | 42.8%         | **+220,995 (+27.2%) — BREACH**    |
| memory            | 639,690   | 26.4%         | +12,818 (+2.0%)                   |
| decisions         | 607,746   | 25.1%         | +94,050 (+18.3%) — under 20% gate |
| briefing          | 93,414    | 3.9%          | **+25,099 (+36.7%) — BREACH**     |
| jtbd              | 35,624    | 1.5%          | 0                                 |
| project-claude-md | 7,219     | 0.3%          | 0                                 |

Not measured: `hooks` and `skills` (`reason=source-absent` — this is an adopter tree with no `packages/`), `framework-injected` (`reason=framework-injected-no-on-disk-source`).

**The two breaches are this session's own output.** `problems` grew by the P091/P092 tickets plus substantial appends to P033, P074, P080 and P007; `decisions` by ADR-043 and the amendments to ADR-025/027/028/041/042. That is not drift — it is a single session that closed two tickets, promoted an ADR and filed two more. Worth stating plainly so a future reader does not treat the breach as unexplained accumulation.

## Per-Plugin Decomposition

Resolved in **cache-fallback mode** — no `packages/` in this tree, so the helper back-walked the plugin cache on `$PATH`.

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
| accessibility-agents | 0       | 0.0%       |

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

`wr-itil` skills alone are **1,008,146 bytes — 76.3% of all skill prose and larger than the entire `decisions` bucket**. This session loaded four of them (`manage-problem`, `capture-problem`, `work-problem`, `list-problems`), and two arrived truncated by compaction with a `use Read on the skill path if you need the full text` note.

## Top-N Offenders

| Surface                       | Bytes     | Bucket   | Comparable prior                                                                      |
| ----------------------------- | --------- | -------- | ------------------------------------------------------------------------------------- |
| `wr-itil` skills (all)        | 1,008,146 | skills   | not estimated — no prior data for a plugin-level skill-prose reclamation              |
| `docs/problems/` (91 tickets) | 1,034,828 | problems | P100 split `BRIEFING.md` into per-topic files; no equivalent split exists for tickets |
| `docs/problems/**/074-*.md`   | 39,884    | problems | not estimated — no prior data                                                         |
| `docs/problems/**/028-*.md`   | 36,865    | problems | not estimated — no prior data                                                         |
| `docs/briefing/README.md`     | 6,664     | briefing | P099 promoted ADR-040 Tier 3 to advisory enforcement                                  |

## Per-Turn Attribution

per-turn attribution: **not measured — no session log accessible**. No `.afk-run-state/*.jsonl` exists in this tree; this was an interactive session, not an AFK orchestrator run.

## Suggestions

1. **skills / `wr-itil`** — 1,008,146 bytes across the plugin's skills is the single largest measured surface, and the four loaded this session were each large enough that two were compaction-truncated mid-session. The concrete symptom is in this session's own transcript: `manage-problem` and `capture-problem` both arrived with `[... skill content truncated for compaction ...]`, meaning the agent operated on a partial contract. Comparable prior: `ADR-054` lazy-loaded `REFERENCE.md` sections out of SKILL.md bodies — `wr-retrospective:analyze-context` cites it in its own footer. Estimated byte saving: **not estimated — no prior data** on how much of `wr-itil`'s skill prose is reference-shaped rather than step-shaped.

2. **problems** — 1,034,828 bytes across 91 tickets, 42.8% of measured context and the largest bucket. Six tickets exceed 30 KB each. The largest, `074-…md` at 39,884 bytes, is now **closed**, as is a second large one this session. Closed tickets stay fully in-context because the bucket measures the whole directory. Comparable prior: P100 split the single `BRIEFING.md` into per-topic files under a Tier 3 budget with an advisory script. No equivalent split, archive tier, or budget exists for `docs/problems/`. Estimated byte saving: **not estimated — no prior data**, but 33 closed tickets are a concrete, low-risk archive candidate.

3. **briefing** — 93,414 bytes, +36.7% since 2026-08-02. Five topic files are over the 5,120-byte Tier 3 threshold, including `README.md` itself at 6,664 bytes — the file whose Critical Points section is the session-start surface. None is at the 2× `MUST_SPLIT` ratio. Comparable prior: P099's advisory script is exactly this signal, working as designed. Estimated byte saving: rotating the five `OVER` files to threshold would reclaim **~4,000 bytes** (sum of overage: 1,544 + 74 + 893 + 459 + 541).

4. **decisions** — 607,746 bytes, +18.3%, under the 20% gate but only just. 43 ADRs. The growth this session was ADR-043 plus amendments to five others, which is legitimate; flagged only because two consecutive retros have shown double-digit growth and the bucket is now a quarter of measured context.

## Policy Breaches

| Budget                 | Offender                                           | Bytes | Citation                                         |
| ---------------------- | -------------------------------------------------- | ----- | ------------------------------------------------ |
| ADR-040 Tier 3 (5,120) | `docs/briefing/README.md`                          | 6,664 | `check-briefing-budgets.sh` equivalent, OVER row |
| ADR-040 Tier 3 (5,120) | `docs/briefing/markers-and-edit-gates.md`          | 5,661 | OVER row                                         |
| ADR-040 Tier 3 (5,120) | `docs/briefing/external-comms-marker-mechanics.md` | 5,579 | OVER row                                         |
| ADR-040 Tier 3 (5,120) | `docs/briefing/deploy-infra-and-caching.md`        | 6,013 | OVER row                                         |
| ADR-040 Tier 3 (5,120) | `docs/briefing/babel-esm-and-toolchain.md`         | 5,194 | OVER row                                         |

No file reached the 2× `MUST_SPLIT` ratio. ADR-038's ≤150-byte hook-prose budget was not sampled — `hooks` is `not-measured` in this tree.

<!--
context-snapshot:
  total-bytes: 2418521
  hooks: not measured
  skills: not measured
  memory: 639690
  briefing: 93414
  decisions: 607746
  problems: 1034828
  jtbd: 35624
  project-claude-md: 7219
  framework-injected: not measured
  measurement-method: byte-count-on-disk
  measured-at: 2026-08-08
-->
