# Problem 060: `wr-itil:update-upstream` O→KE lifecycle comment restates the issue body when the filing already carried Known-Error-level content

**Status**: Known Error
**Reported**: 2026-07-19
**Priority**: 3 (Low) — Impact: Negligible (1) × Likelihood: Possible (3) — derived at capture from the description per Step 4a
**Origin**: internal
**Effort**: S — derived at capture per Step 4a (local action is an upstream report; the contract branch itself is a bounded upstream SKILL edit — cf. P058 same fix-belongs-upstream shape)
**WSJF**: 6.0 — (3 × 2.0) / 1 (Known Error transition 2026-07-19 review: root cause confirmed at update-upstream Step 3 SKILL source — no already-communicated-at-filing branch; reconcile-and-skip workaround documented and applied on P031)
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

`/wr-itil:update-upstream` Step 3 derives the fired transition purely from filename-suffix vs last-logged status, with no already-communicated-at-filing branch. When a ticket is reported upstream AFTER its RCA is complete (the common shape — report-upstream drafts from a fully-investigated ticket), a later local Open-to-Known-Error transition drafts a "root cause identified" comment whose entire content is already in the issue body filed days earlier; posting it is the "restating prior as new" credibility self-own the external-comms gate targets. Observed 2026-07-19 working P031: windyroad/agent-plugins#364 was filed 2026-07-18 with full root cause, workaround, and 0.20.0 re-verification; the local KE transition fired update-upstream the next day and the agent had to reach for the --catchup C2 idempotency defence-in-depth clause ("matching prior communication → reconcile and skip") to justify skipping the redundant post — no per-ticket contract branch covers this. Fix belongs upstream in `@windyroad/itil`: add an already-communicated-at-filing check to update-upstream Step 3 (e.g. record the ticket's status at filing time in the Reported Upstream section and skip lifecycle comments for transitions at or below that status).

## Symptoms

(deferred to investigation)

## Workaround

Apply the update-upstream `--catchup` C2 reconcile-and-skip judgement manually (treat matching prior communication as already-logged), and back-write an `## Upstream Lifecycle Updates` entry recording the skip with its rationale. Applied on P031 (2026-07-19).

## Impact Assessment

- **Who is affected**: (deferred to investigation)
- **Frequency**: (deferred to investigation)
- **Severity**: (deferred to investigation)
- **Analytics**: (deferred to investigation)

## Root Cause Analysis

### Investigation Tasks

- [ ] Investigate root cause
- [ ] Create reproduction test

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: (none)

## Related

- P031 (`wr-architect:create-adr` skill does not auto-satisfy edit-gate hooks) — the transition whose update-upstream dispatch surfaced this gap; its `## Upstream Lifecycle Updates` entry records the manual reconcile-and-skip.
- P058 (`wr-risk-scorer-restage-commit` bypasses external-comms commit-message gate) — same locally-tracked, fix-belongs-upstream-in-`@windyroad` shape.
- Hang-off pre-filter: no open/verifying ticket bodies reference `/wr-itil:update-upstream`; subagent dispatch skipped (empty candidate set). Captured via /wr-itil:capture-problem; expand at next investigation.
