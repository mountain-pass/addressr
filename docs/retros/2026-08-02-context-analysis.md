# Context Analysis — 2026-08-02

> Source: `/wr-retrospective:analyze-context` (deep layer per wr-retrospective ADR-043).
> Auto-fired from `run-retro` Step 2c: BOTH triggers held — calendar-elapse (prior report 2026-07-19, 14 days) AND delta-breach on two buckets clearing the 20% and 10 KB floors.
> Methodology: byte-count-on-disk + per-plugin decomposition. Per-turn attribution not available (see below).
> Cheap-layer baseline: `wr-retrospective-measure-context-budget`.

**Headline caveat (framework ADR-026 grounding), carried forward from the 2026-07-19 report:** byte-count-on-disk is an upper bound on what _could_ enter context, not what _does_. The `memory` and `briefing` buckets over-count badly — neither is loaded whole per session. Treat the totals as a ceiling, and read the per-file decomposition rather than the bucket headline.

**Identifier-namespace note.** This repo and the installed `wr-*` plugins share an `ADR-NNN` / `P-NNN` numbering space, and they do NOT agree. Framework identifiers below are prefixed (`framework ADR-026`, `wr-retrospective ADR-043`, `framework P097`); unprefixed `ADR-029 / ADR-031 / ADR-041` and file paths under `docs/decisions/` are this repo's. Without the prefix, `ADR-040` reads as the framework Tier-3 briefing budget in one column and this repo's release-pipeline change-type matrix in the next.

## Bucket Totals

Measured repo-bucket total: **2,065,559 bytes** (Δ **+699,400** vs 2026-07-19's 1,366,159).

| Bucket             | Bytes   | % of measured | Δ vs prior (07-19)                                    |
| ------------------ | ------- | ------------- | ----------------------------------------------------- |
| problems           | 813,833 | 39.4%         | **+386,455 (+90.4%) — BREACH**                        |
| memory             | 626,872 | 30.3%         | +39,219 (+6.7%)                                       |
| decisions          | 513,696 | 24.9%         | **+194,352 (+60.9%) — BREACH**                        |
| briefing           | 68,315  | 3.3%          | +34,697 — see measurement-surface note                |
| jtbd               | 35,624  | 1.7%          | not measured prior                                    |
| project-claude-md  | 7,219   | 0.3%          | not measured prior                                    |
| hooks              | —       | —             | `not-measured — source-absent`                        |
| skills             | —       | —             | `not-measured — source-absent`                        |
| framework-injected | —       | —             | `not-measured — framework-injected-no-on-disk-source` |

**Measurement-surface note on `briefing`:** the +34,697 delta is NOT pure growth. The legacy single `docs/BRIEFING.md` (33,618 bytes) was decomposed into an 11-file `docs/briefing/` tree on 2026-07-28, and the prior snapshot's bucket layer reported `source-absent` for it. The bucket now measures a tree the prior run could not see. Real growth is smaller than the delta implies and is not separable from this run's data.

**`hooks` / `skills` are `source-absent`** because this is an adopter repo with no `packages/` directory. The per-plugin decomposition below resolves via the framework ADR-049 cache-fallback path instead, so those numbers are real but are NOT part of the repo-bucket total above.

## Per-Plugin Decomposition

Resolved via cache-fallback mode (`*/cache/<owner>/<plugin>/<version>/bin` back-walk). These are plugin-install surfaces, not repo content.

### Hooks (aggregate 550,272 bytes)

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

`wr-itil` is 76.3% of the skills surface on its own, and the largest hooks surface as well.

## Top-N Offenders

| Surface                                                                                  | Bytes  | Bucket    | Comparable prior                                                            |
| ---------------------------------------------------------------------------------------- | ------ | --------- | --------------------------------------------------------------------------- |
| `docs/problems/README-history.md`                                                        | 62,713 | problems  | framework P100 split `BRIEFING.md` into a per-topic tree                    |
| `docs/decisions/040-release-pipeline-change-type-action-matrix.proposed.md`              | 50,648 | decisions | framework ADR-038 progressive disclosure (SKILL.md + REFERENCE.md split)    |
| `docs/decisions/029-opensearch-blue-green-two-phase-upgrade.accepted.md`                 | 49,849 | decisions | framework ADR-038 progressive disclosure                                    |
| `docs/decisions/031-read-shadow-for-search-backend-migrations.proposed.md`               | 47,446 | decisions | framework ADR-038 progressive disclosure                                    |
| `docs/problems/closed/028-opensearch-1-3-20-version-debt.md`                             | 36,850 | problems  | `not estimated — no prior data` (no closed-ticket archive tier exists)      |
| `docs/problems/known-error/039-decouple-saas-deployment-from-npm-publish.md`             | 32,015 | problems  | `not estimated — no prior data`                                             |
| `docs/problems/verifying/069-partial-prefix-search-recall-longer-query-drops-results.md` | 30,965 | problems  | `not estimated — no prior data`                                             |
| `docs/decisions/README.md` (generated compendium)                                        | 29,192 | decisions | wr-architect ADR-077 hook-regenerated; destructive-generator caveat applies |

**Answering the question the cheap layer asked:** the `problems` growth is **both**, not one or the other. 81 files, mean 10,160 bytes — so the corpus is large-ticket-heavy by mean, but the single biggest accumulator is an archive file, not a ticket.

**`decisions` growth is ADR bodies, not the compendium.** The top three ADRs (50,648 + 49,849 + 47,446 = 147,943) are 28.8% of the bucket on their own; the generated `README.md` compendium is fourth at 29,192.

## Archive-vs-live split inside `problems`

| Segment                                        | Bytes   | % of bucket |
| ---------------------------------------------- | ------- | ----------- |
| `closed/` (resolved, historical)               | 300,777 | 37.0%       |
| `README-history.md` (append-only)              | 62,713  | 7.7%        |
| `open/` + `known-error/` + `verifying/` (live) | 343,423 | 42.2%       |

**44.7% of the `problems` bucket is archive** — content that is never actionable and is read only for provenance.

## Per-Turn Attribution

`per-turn attribution: not measured — no session log accessible`. The two files under `.afk-run-state/` (`outstanding-questions.jsonl`, `risk-register-queue.jsonl`) are orchestrator queue files, not per-turn session logs carrying a `usage` field.

## Suggestions

1. **`docs/problems/README-history.md`** — rotate entries older than ~2 months into `docs/problems/README-history-archive.md`. This file is append-only by design (framework P134 last-reviewed rotation writes to it every capture) and has never itself been rotated, so it grows monotonically and is the single largest file in the largest bucket. Comparable prior: `framework P100 split docs/BRIEFING.md into a per-topic tree`; the Tier 3 rotation pass in `run-retro` Step 3 is the same shape applied to briefing files. Estimated byte saving: **~40 KB** (the pre-July entries), anchored on the observed date distribution.

2. **`docs/problems/closed/`** — introduce an archive tier so closed tickets are excluded from routine enumeration. At 300,777 bytes across the segment this is 37.0% of the bucket and is read only for provenance. Comparable prior: `not estimated — no prior data` — no closed-ticket archive tier has been attempted in this repo, so the saving is a measured segment size, not a projected reclamation.

3. **The three ≥47 KB ADRs (040, 029, 031)** — apply framework ADR-038 progressive disclosure: keep the decision + Confirmation in the ADR body and move worked examples, amendment ledgers, and migration narratives into a sibling `REFERENCE.md`. ADR-031 alone carries a five-entry dated amendment ledger (2026-05-14, 2026-07-06, 2026-07-10, 2026-07-31, 2026-08-02). Comparable prior: `framework ADR-038 progressive disclosure (SKILL.md + REFERENCE.md split)`, which is the pattern the wr-retrospective and wr-itil skills already use. Estimated byte saving: `not estimated — no prior data` for ADR bodies specifically; the SKILL.md precedent does not transfer a ratio.

4. **`briefing` tree** — 7 of 11 files are at or above the framework ADR-040 Tier 3 threshold (see Policy Breaches). Rotation is `run-retro` Step 3's job and is handled in this retro's Topic File Rotation section, not here.

## Policy Breaches

| Budget                                               | Offender                                                                            | Bytes        | Citation                                                              |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------- |
| framework ADR-040 Tier 3 (5,120 bytes)               | `docs/briefing/markers-and-edit-gates.md`                                           | 9,425        | direct `wc -c`, threshold 5,120                                       |
| framework ADR-040 Tier 3                             | `docs/briefing/external-comms-and-compendium.md`                                    | 9,300        | direct `wc -c`                                                        |
| framework ADR-040 Tier 3                             | `docs/briefing/releases-and-ci.md`                                                  | 9,093        | direct `wc -c`                                                        |
| framework ADR-040 Tier 3                             | `docs/briefing/agent-and-workflow-patterns.md`                                      | 6,373        | direct `wc -c`                                                        |
| framework ADR-040 Tier 3                             | `docs/briefing/deploy-infra-and-caching.md`                                         | 6,013        | direct `wc -c`                                                        |
| framework ADR-040 Tier 3                             | `docs/briefing/testing-tdd-and-code.md`                                             | 5,873        | direct `wc -c`                                                        |
| framework ADR-040 Tier 3                             | `docs/briefing/README.md`                                                           | 5,294        | direct `wc -c`                                                        |
| framework ADR-038 / framework P097 (SKILL.md ≥50 KB) | `wr-itil` — `work-problems`, `review-problems`, `manage-problem`, `capture-problem` | >51,200 each | `find -size +50k` over the plugin cache                               |
| framework ADR-038 / framework P097 (SKILL.md ≥50 KB) | `wr-retrospective` — `run-retro`                                                    | >51,200      | `find -size +50k`; 4 cached versions (0.18.1, 0.24.1, 0.25.0, 0.27.0) |

None of the Tier 3 breaches reach 2× the ceiling (10,240), so none carries a `MUST_SPLIT` per framework P145 — all are Branch B rotations.

The framework P097 breaches are in installed plugin surfaces, not this repo's content. They are recorded here because they are the dominant `skills` cost (`wr-itil` alone is 76.3%) and are upstream-owned; this repo cannot remediate them.

<!--
context-snapshot:
  total-bytes: 2065559
  hooks: not measured — source-absent (adopter repo; cache-fallback aggregate 550272)
  skills: not measured — source-absent (adopter repo; cache-fallback aggregate 1321795)
  memory: 626872
  briefing: 68315
  decisions: 513696
  problems: 813833
  jtbd: 35624
  project-claude-md: 7219
  framework-injected: not measured
  measurement-method: byte-count-on-disk
  measured-at: 2026-08-02
-->
