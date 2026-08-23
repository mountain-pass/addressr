# Context Analysis — 2026-08-20

> Source: `/wr-retrospective:analyze-context` (deep layer per ADR-043). **Auto-fired** from run-retro Step 2c:
> the delta axis breached on three buckets, each clearing both the 20% and the 10 KB absolute floor. The
> calendar axis did NOT fire (12 days since 2026-08-08, under the 14-day bound), so this run is delta-driven.
> Methodology: byte-count-on-disk + per-plugin decomposition. Per-turn attribution not available (see below).
> Cheap-layer baseline: `wr-retrospective-measure-context-budget`.

## Bucket Totals

Prior snapshot: `docs/retros/2026-08-08-context-analysis.md` trailer, `measured-at: 2026-08-08`.

| Bucket              | Bytes     | % of measured | Δ vs prior          |
| ------------------- | --------- | ------------- | ------------------- |
| `problems`          | 1,425,458 | 45.9%         | +390,630 (+37.7%) ⚠ |
| `decisions`         | 799,581   | 25.8%         | +191,835 (+31.6%) ⚠ |
| `memory`            | 713,402   | 23.0%         | +73,712 (+11.5%)    |
| `briefing`          | 103,316   | 3.3%          | +9,902 (+10.6%)     |
| `jtbd`              | 55,172    | 1.8%          | +19,548 (+54.9%) ⚠  |
| `project-claude-md` | 7,219     | 0.2%          | 0 (0.0%)            |
| **Total measured**  | 3,104,148 | 100%          | +685,627 (+28.3%)   |

⚠ = breached the ADR-043 delta trigger (>20% AND >10 KB). Three buckets, any one of which fires the deep layer.

Not measured, with reasons carried verbatim from the cheap layer:

| Bucket               | Reason                                                  |
| -------------------- | ------------------------------------------------------- |
| `framework-injected` | `framework-injected-no-on-disk-source`                  |
| `hooks`              | reported `bytes=0` — see the sanity-check failure below |
| `skills`             | reported `bytes=0` — see the sanity-check failure below |

### Sanity-check FAILURE — the aggregate under-reports plugin context by ~1.86 MB

ADR-043's deep-layer contract says the cheap-layer `hooks` aggregate must equal the sum of `PLUGIN-HOOKS`
rows, and `skills` likewise. **It does not, and the gap is the largest single finding in this report.**

| Surface  | Cheap-layer aggregate | Sum of per-plugin rows | Gap            |
| -------- | --------------------- | ---------------------- | -------------- |
| `hooks`  | 0                     | 535,955                | −535,955       |
| `skills` | 0                     | 1,320,464              | −1,320,464     |
| **Both** | **0**                 | **1,856,419**          | **−1,856,419** |

**Cause, not speculation.** `addressr` is an ADOPTER tree: it has no `packages/` directory, so the cheap
layer's source-tree walk finds nothing and honestly reports zero. The per-plugin helper falls back to
`$PATH` plugin-cache sniffing and finds the real bytes. Both are behaving as designed; the contract that
relates them assumes a source-repo shape.

**Why it matters rather than being a curiosity.** Measured context in this repo is reported as 3.10 MB. The
plugin surfaces actually loaded add ~1.86 MB — **37.5% of the true total is invisible to the cheap layer,
and the single largest contributor in the whole system is not in the table at all.** Every delta trigger,
every top-offender ranking, and every trim decision made from the cheap layer alone is computed over 62.5%
of the picture. This is the measure-the-repo-not-the-system error this session hit twice in production
(P110, P112), arriving in the measurement tooling itself.

## Per-Plugin Decomposition

### Hooks (per-plugin sum: 535,955 bytes; cheap-layer aggregate: 0 — see above)

| Plugin                 | Bytes   | % of hooks |
| ---------------------- | ------- | ---------- |
| `wr-itil`              | 186,354 | 34.8%      |
| `wr-risk-scorer`       | 118,484 | 22.1%      |
| `wr-architect`         | 72,880  | 13.6%      |
| `wr-voice-tone`        | 64,781  | 12.1%      |
| `wr-jtbd`              | 43,389  | 8.1%       |
| `wr-style-guide`       | 27,801  | 5.2%       |
| `wr-retrospective`     | 21,818  | 4.1%       |
| `ponytail`             | 448     | 0.1%       |
| `accessibility-agents` | 0       | 0.0%       |

### Skills (per-plugin sum: 1,320,464 bytes; cheap-layer aggregate: 0 — see above)

| Plugin             | Bytes     | % of skills |
| ------------------ | --------- | ----------- |
| `wr-itil`          | 1,008,146 | 76.3%       |
| `wr-retrospective` | 118,136   | 8.9%        |
| `wr-risk-scorer`   | 74,674    | 5.7%        |
| `wr-architect`     | 67,938    | 5.1%        |
| `wr-jtbd`          | 21,702    | 1.6%        |
| `ponytail`         | 15,500    | 1.2%        |
| `wr-voice-tone`    | 10,473    | 0.8%        |
| `wr-style-guide`   | 3,895     | 0.3%        |

`wr-itil` alone is 1,008,146 bytes of skill prose — **larger than the entire `decisions` bucket** and 32% of
all measured on-disk context. It is the single biggest surface in the system by a wide margin.

## Top-N Offenders

| Surface                                                                     | Bytes  | Bucket    | Comparable prior                                                      |
| --------------------------------------------------------------------------- | ------ | --------- | --------------------------------------------------------------------- |
| `docs/problems/open/033-source-inspection-tests-anti-pattern.md`            | 70,664 | problems  | `not estimated — no prior data` for a single-ticket trim in this repo |
| `docs/decisions/040-release-pipeline-change-type-action-matrix.proposed.md` | 65,839 | decisions | `not estimated — no prior data`                                       |
| `docs/decisions/029-opensearch-blue-green-two-phase-upgrade.accepted.md`    | 56,092 | decisions | `not estimated — no prior data`                                       |
| `docs/decisions/031-read-shadow-for-search-backend-migrations.proposed.md`  | 47,651 | decisions | `not estimated — no prior data`                                       |
| `docs/problems/closed/039-decouple-saas-deployment-from-npm-publish.md`     | 41,265 | problems  | `not estimated — no prior data`                                       |

### The largest file doubled today, and this session did it

`docs/problems/open/033-source-inspection-tests-anti-pattern.md`, measured at the prior snapshot's commit
(`793aa37d`, 2026-08-08) and now:

- then: **35,671 bytes**
- now: **70,664 bytes** — **+34,993 (+98.1%)**, across **6 commits today** (`git log --since="2026-08-20 00:00"`).

That single file accounts for 9.0% of the entire `problems` bucket growth since the prior snapshot. It is
now the largest file in the repository's governance corpus, and the growth is almost entirely this session's
correction-and-recount cycles on one ticket.

The ticket's content is not waste — every addition was a correction that a guard or a review demanded, and
the recount discipline is what kept its figures honest. But a 70 KB single ticket is past the point where a
reader can hold it, and the same rule the repo applies to briefing files (ADR-040 Tier 3, 5 KB) has no
counterpart for problem tickets. Recorded as an observation, not a trim instruction: no comparable prior
exists for splitting a problem ticket in this repo, so any byte estimate would be ungrounded.

## Per-Turn Attribution

`per-turn attribution: not measured — no session log accessible`.

Checked and ruled out rather than assumed: `.afk-run-state/` contains `outstanding-questions.jsonl` (11
lines) and `risk-register-queue.jsonl` (142 lines). Both were parsed; **neither carries a `usage` field** —
they are governance queue files, not session transcripts. No AFK orchestrator log exists for this session
because it ran interactively.

## Suggestions

Per ADR-026, each cites a specific surface and either a comparable prior or the explicit no-prior sentinel.

1. **Measurement tooling — close the adopter-tree blind spot.** The cheap layer reports `hooks`/`skills` as
   zero in any tree without `packages/`, hiding 1,856,419 bytes — 37.5% of true measured context. The
   per-plugin helper already resolves it via `$PATH` cache-fallback, so the fix is to have the cheap layer
   use the same fallback rather than reporting a bare zero, OR to emit
   `not-measured reason=adopter-tree-no-packages-dir` instead of `bytes=0` so the absence is legible.
   Comparable prior: `not estimated — no prior data`. Estimated saving: none — this is a correctness fix,
   not a trim. **This is the highest-value item in the report** and is being ticketed from this retro.

2. **`wr-itil` skills — 1,008,146 bytes, 76.3% of all skill prose.** ADR-054 (SKILL.md runtime-budget
   policy) and ADR-038 (progressive disclosure) already name the pattern, and `transition-problem`'s Step 7b
   demonstrates the remedy in practice: a one-line `grep` pre-check that avoids loading a ~14 KB sibling
   SKILL for the common no-op case. Comparable prior: that Step 7b pre-check, cited in its own prose as
   avoiding "~14 KB into the calling agent's context". Estimated saving: `not estimated — no prior data` for
   a corpus-wide application, but the per-site prior is concrete and measured.

3. **`docs/problems/` — 1.43 MB across 110 tickets, +37.7% in 12 days.** The corpus grows monotonically;
   nothing prunes or archives closed tickets, and closed tickets are 100% of the read cost with ~0% of the
   read value in routine work. Comparable prior: `P100 split BRIEFING.md into per-topic files`; and this
   repo's own ADR-040 Tier 3 rotation, which archives rather than deletes. Estimated saving:
   `not estimated — no prior data` for problem-ticket archival specifically.

4. **`docs/decisions/` — +31.6% in 12 days, with four files over 42 KB.** Two ADRs landed today (051, 052).
   The compendium (`docs/decisions/README.md`) already exists as the intended routine-load surface per
   ADR-077, so the per-ADR bodies should be pull-based. Comparable prior: ADR-077's compendium design.
   Estimated saving: `not estimated — no prior data`.

5. **`memory` — 713,402 bytes, 23.0% of measured, +11.5%.** Loaded every session. Not analysed further here;
   flagged because it is the third-largest bucket and no budget governs it. Comparable prior:
   `not estimated — no prior data`.

## Policy Breaches

| Budget                   | Offender                                           | Bytes | Citation                                     |
| ------------------------ | -------------------------------------------------- | ----- | -------------------------------------------- |
| ADR-040 Tier 3 (5,120 B) | `docs/briefing/README.md`                          | 7,831 | `check-briefing-budgets.sh` equivalent, OVER |
| ADR-040 Tier 3 (5,120 B) | `docs/briefing/testing-tdd-and-code.md`            | 7,408 | OVER                                         |
| ADR-040 Tier 3 (5,120 B) | `docs/briefing/babel-esm-and-toolchain.md`         | 6,681 | OVER                                         |
| ADR-040 Tier 3 (5,120 B) | `docs/briefing/deploy-infra-and-caching.md`        | 6,013 | OVER                                         |
| ADR-040 Tier 3 (5,120 B) | `docs/briefing/markers-and-edit-gates.md`          | 5,661 | OVER                                         |
| ADR-040 Tier 3 (5,120 B) | `docs/briefing/external-comms-marker-mechanics.md` | 5,579 | OVER                                         |
| ADR-040 Tier 3 (5,120 B) | `docs/briefing/itil-workflow-traps.md`             | 5,553 | OVER                                         |
| ADR-040 Tier 3 (5,120 B) | `docs/briefing/what-you-need-to-know.md`           | 5,425 | OVER                                         |

**No `MUST_SPLIT` rows** — every offender sits between 1.0× and 2.0× the ceiling, so Branch B of the run-retro
Step 3 rotation applies (rotation required, no do-nothing option). Handled in this retro's Step 3.

ADR-038's ≤150-byte hook-prose budget and ADR-038's 50 KB SKILL.md cluster (P097) are **not measurable from
this tree** — both target `packages/`, which an adopter repo does not have. `not measured — adopter tree, no
packages/ directory`.

<!--
context-snapshot:
  total-bytes: 3104148
  hooks: 0
  skills: 0
  hooks-per-plugin-sum: 535955
  skills-per-plugin-sum: 1320464
  memory: 713402
  briefing: 103316
  decisions: 799581
  problems: 1425458
  jtbd: 55172
  project-claude-md: 7219
  framework-injected: not measured
  measurement-method: byte-count-on-disk
  measured-at: 2026-08-20
-->
