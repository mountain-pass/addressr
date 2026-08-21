# Problem 114: Three governance checks that cannot fail — pre-check on shape, drain on unbounded evidence, measure the wrong tree

**Status**: Open
**Reported**: 2026-08-20
**Priority**: 6 (Medium) — Impact: 2 × Likelihood: 3. Impact 2: governance-tooling correctness; no runtime, publish or consumer path, and each instance degrades a decision rather than breaking one. Likelihood 3: all three are present and observed, but each produces a wrong-but-recoverable answer rather than a silent shipped defect.
**Origin**: internal
**Effort**: M — three surfaces on two upstream plugins; the coordinating ticket exists so they are fixed as one class rather than three papercuts.
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

**Coordinating ticket** per run-retro Step 4b's ≥3-improvements-on-one-target rule. Three separate
governance surfaces observed on 2026-08-20 share one shape: **a check whose answer is determined before it
runs.** This repo has spent the day naming that class in its own code (P033's settled rule, P106, P112's
alarm reading OK over no data); these three are the same shape in the tooling that enforces it.

### 1. A pre-check that fires on shape, not on state (`wr-itil` `transition-problem` Step 7b)

Step 7b greps the ticket for `## Reported Upstream` or `**Origin**: inbound-reported (#NN)` and dispatches
`/wr-itil:update-upstream` when either is present. It greps **ticket shape**, never **upstream state**.

Observed closing P069: the pre-check matched, but `gh issue view 365` showed `state: CLOSED` since
2026-08-02 with the fix-released comment already posted. The dispatch's entire purpose was already
satisfied. A check that fires on a condition already met is a check that cannot fail — one level up from
where this repo usually finds it.

### 2. A drain that inherits whatever evidence standard a prior session wrote (run-retro Step 4a sub-step 9)

The P282 prior-session drain closes any `verifying/` ticket whose README Verification Queue cell begins
`yes — observed:`. P186 constrains the **verdict vocabulary** — three canonical values — but says nothing
about **evidence quality**. A cell reading `yes — observed: looks fine` is equally admissible to the glob.

P069's cell happened to be excellent: named query, before value (0), after value (4, target at #1), live
endpoint, plus an unchanged control query and a data-layer term-query proof. It could have failed and did
not. **The drain is only as good as its weakest admissible cell, and nothing checks that at drain time.**

### 3. A measurement that reports zero for the largest surface (`wr-retrospective` cheap layer)

`wr-retrospective-measure-context-budget` reports `hooks bytes=0` and `skills bytes=0` in this repo. Both
are honest — `addressr` is an adopter tree with no `packages/` directory, so the source-tree walk finds
nothing. But `wr-retrospective-list-plugin-attribution`, which falls back to sniffing `$PATH` for the plugin
cache, finds **535,955 bytes of hooks and 1,320,464 of skills** (`wr-itil` skills alone: 1,008,146 — larger
than this repo's entire `decisions` bucket).

ADR-043's own deep-layer contract states the aggregate must equal the sum of the per-plugin rows. It does
not, by 1,856,419 bytes — **37.5% of true measured context is invisible**, and the single largest
contributor is absent from the table entirely. Every delta trigger, top-offender ranking and trim decision
made from the cheap layer alone is computed over 62.5% of the picture. Measured 2026-08-20; see
`docs/retros/2026-08-20-context-analysis.md`.

## Symptoms

1. A dispatch is contractually required against an upstream issue already in its target state.
2. A ticket closes on a prior-session evidence cell that no gate held to a standard.
3. A context report ranks buckets while omitting the largest one, and reports `bytes=0` rather than a
   `not-measured` sentinel that would make the absence legible.

## Root Cause Analysis

Each surface takes a cheap proxy for the thing it means:

- **Shape for state** — "the ticket says it was reported upstream" for "upstream still needs telling".
- **Vocabulary for quality** — "the cell starts with the right three words" for "the evidence is sound".
- **This tree for the system** — "no `packages/` here" for "no plugin context loaded". This is P110's and
  P112's error, in the tooling rather than in production.

### Investigation Tasks

- [ ] **(3) is the highest-value fix and the cheapest.** Have the cheap layer use the same `$PATH`
      cache-fallback the per-plugin helper already implements — or, at minimum, emit
      `not-measured reason=adopter-tree-no-packages-dir` instead of `bytes=0`, so absence is legible rather
      than reported as zero.
- [ ] **(1)**: extend the Step 7b pre-check from ticket shape to upstream state, or have `update-upstream`
      exit early and cheaply on an already-satisfied issue. Note R028's position that a check whose remedy is
      a no-op "gets performed, which turns a signal into a ritual".
- [ ] **(2)**: decide whether an evidence floor at drain time is worth its cost, or whether the honest answer
      is that the drain surfaces a candidate and the Step 5 table is the audit. Recovery is already a single
      skill invocation, so the bar should be set against that cheapness, not against irreversibility.
- [ ] All three are upstream surfaces (`wr-itil`, `wr-retrospective`). Decide report-upstream vs local
      workaround per item; cf. P060 and P054 for the upstream-blocked precedent.

## Fix Strategy

**Kind**: `improve`. **Shape**: skill improvements across two upstream plugins, coordinated here rather than
split into three tickets per run-retro Step 4b's coordinating-ticket rule.

- `wr-retrospective` cheap layer — adopter-tree measurement (item 3). Highest value, smallest edit.
- `wr-itil` `transition-problem` Step 7b — state-aware pre-check (item 1).
- `wr-retrospective` run-retro Step 4a sub-step 9 — drain evidence floor (item 2).

**Evidence**: all three observed 2026-08-20 during the P069 closure and the retro's own diagnostic run;
byte counts in `docs/retros/2026-08-20-context-analysis.md`.

## Related

- **[P112](../closed/112-the-availability-alarm-has-read-ok-since-2021-over-no-data.md)** and
  **[P110](110-latency-is-measured-at-the-gateway-and-alerts-nowhere-that-qualifies.md)** — the same
  repo-is-not-the-system error, in production rather than in tooling. Item 3 is that error inside the
  instrument built to measure it.
- **[P033](../closed/033-source-inspection-tests-anti-pattern.md)** — the anti-vacuity class this repo has spent the
  most effort on. All three items here are instances.
- **[P106](106-license-compliance-gate-scans-an-empty-tree-and-exits-zero.md)** — a gate that scans
  an empty tree and exits zero; item 3 is the measurement analogue.
- **ADR-043** — the deep/cheap layer contract whose aggregate-equals-sum invariant item 3 violates.
- **P186 / P282** — the verdict vocabulary and the prior-session drain that item 2 sits between.
