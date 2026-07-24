# Problem 045: RISK-POLICY staleness window hardcoded at 14 days conflicts with the quarterly review cadence

**Status**: Closed
**Reported**: 2026-07-06
**Priority**: 3 (Low) — Impact: Negligible (1) × Likelihood: Possible (3)
**Origin**: internal
**Effort**: S (M → S — 2026-07-20 re-verification: upstream fix already shipped in wr-risk-scorer 0.17.0; residual fix is a one-line RISK-POLICY.md reformat)
**WSJF**: n/a — Verification Pending (excluded from dev-work ranking per ADR-022)
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

wr-risk-scorer commit-gate hook hardcodes 14-day RISK-POLICY staleness window; policy now declares a user-directed quarterly review cadence (RISK-POLICY.md 2026-07-06), so the gate will nag fortnightly regardless — upstream plugin needs a configurable window.

The hardcode is at `wr-risk-scorer/0.13.5/hooks/risk-score-commit-gate.sh:50` (`(date.today() - reviewed).days > 14`). RISK-POLICY.md's declared cadence (`**Review cadence:** quarterly (next review due 2026-10-06)`) is not read by the hook, so commits will be blocked with the "stale policy" deny roughly every fortnight and the operator must bump the last-reviewed date (or re-run /wr-risk-scorer:update-policy) far more often than the policy requires. Likely fix direction: upstream feature request / patch making the window configurable (env var, or parse the cadence line from the policy itself), reported via /wr-itil:report-upstream to the windyroad plugin repo.

## Symptoms

(deferred to investigation)

## Workaround

(Retired 2026-07-20 — fix released.) Bump the `Last reviewed:` date in RISK-POLICY.md whenever the gate blocks (a fortnightly date-only touch commit), keeping the quarterly substantive review cadence recorded in the policy.

## Fix Released

Committed to master 2026-07-20 (fix commit, doc-only — no changeset/npm surface). One-line reformat of RISK-POLICY.md's cadence line to the installed wr-risk-scorer 0.17.0 machine-read form (`> Reviewed quarterly ...`), per RFC-006. In-session evidence: the hook's exact parsing logic run against the edited policy yields `cadence='quarterly' threshold=90 stale=False` (pre-fix it yielded cadence unmatched → 14-day fallback). Awaiting user verification — expected observable: no "stale policy" commit-gate deny before 2026-10-06 (next quarterly review), no more fortnightly date-bump touch commits.

**Closed on evidence 2026-07-24** (`/wr-itil:review-problems` Step 4 Bucket 1, ADR-044 framework-mediated close-on-evidence): re-confirmed live this pass — RISK-POLICY.md line 7 is in the blockquote cadence form (`> Reviewed quarterly — next review due 2026-10-06 …`) the installed wr-risk-scorer 0.17.0 hook regex `^>?\s*Reviewed\s+([A-Za-z]+)` parses to quarterly → 90-day threshold; the fix is committed and in-tree. Recovery: rerun `/wr-itil:transition-problem 045 known-error` to reopen.

## Impact Assessment

- **Who is affected**: addressr-maintainer only (commit-gate friction; no product user or API consumer impact)
- **Frequency**: once per fortnight per active repo while the 14-day fallback applied — each occurrence forced a date-bump touch commit
- **Severity**: Low — workflow friction and a misleading "stale policy" deny; no service, release, or data impact
- **Analytics**: N/A (local dev tooling; no telemetry)

## Root Cause Analysis

Re-verification 2026-07-20 (AFK iter): the upstream hardcode cited at capture (`wr-risk-scorer/0.13.5/hooks/risk-score-commit-gate.sh:50`, `(date.today() - reviewed).days > 14`) is **removed in the currently installed wr-risk-scorer 0.17.0** (plugin cache 2026-07-11, newest + enabled). The 0.17.0 hook implements upstream ADR-091/P408: it parses the policy's own cadence line via `(?m)^>?\s*Reviewed\s+([A-Za-z]+)` (case-sensitive), mapping quarterly → 90 days, and falls back to 14 days only when no cadence line matches. Empirical test against this repo's RISK-POLICY.md confirmed the residual defect had become **local**: the date line `**Last reviewed:** 2026-07-18` matched, but the cadence line `**Review cadence:** quarterly ...` did NOT match the regex (leading `**`), so the hook still fell back to 14 days. Fix: reformat the cadence line to the blockquote form the hook parses (RFC-006). Post-edit verification with the hook's exact parsing logic: `cadence='quarterly' threshold=90 stale=False`. Note: the hook's staleness backstop computes last-reviewed + 90 days (2026-07-20 + 90 = 2026-10-18), slightly later than the policy's stated next-review-due 2026-10-06 — the policy's own date remains authoritative for humans; the gate is a later backstop, not a contradiction.

### Investigation Tasks

- [x] Re-rate Priority and Effort at next /wr-itil:review-problems (Effort M → S 2026-07-20 — residual fix was a one-line reformat)
- [x] Report upstream to the wr-risk-scorer plugin repo via /wr-itil:report-upstream (configurable staleness window, or hook reads the policy's cadence line) — reconciled-and-skipped 2026-07-20 per P060 precedent: upstream shipped exactly this fix (cadence-parsing hook, upstream ADR-091/P408) in 0.17.0 before we filed; a report would be redundant
- [x] Create reproduction test — covered by in-session empirical check of the installed hook's parsing logic against RISK-POLICY.md (pre-fix: cadence unmatched → 14-day fallback; post-fix: quarterly → 90). The hook is upstream-owned; its behavioural tests live upstream

## Fix Strategy

Reformat RISK-POLICY.md line 6 to `> Reviewed quarterly — next review due 2026-10-06 (user-directed cadence, 2026-07-06)` so the installed hook's ADR-091 machine-read regex parses the quarterly cadence (90-day staleness threshold). Semantics preserved; applied via /wr-risk-scorer:update-policy (scorer-validated, RISK_VERDICT: PASS). Scoped by RFC-006. The fortnightly date-bump workaround retires.

**Release vehicle**: fix commit on master (doc-only — RISK-POLICY.md + governance docs; no changeset per ADR-014 doc-only convention, no npm publish surface)

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: (none)

## Related

(captured via /wr-itil:capture-problem; expand at next investigation)

- RISK-POLICY.md quarterly-cadence amendment (commit d2ee199, 2026-07-06) — the user direction the hook contradicts.

## RFCs

| RFC     | Status   | Title                                                                                     |
| ------- | -------- | ----------------------------------------------------------------------------------------- |
| RFC-006 | proposed | Align RISK-POLICY.md cadence line with the installed wr-risk-scorer machine-read contract |
