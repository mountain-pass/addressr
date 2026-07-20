---
status: proposed
rfc-id: risk-policy-cadence-line-machine-read-contract
reported: 2026-07-20
human-oversight: unconfirmed
decision-makers: [Tom Howard]
problems: [P045]
adrs: []
jtbd: [JTBD-400]
stories: []
---

# RFC-006: Align RISK-POLICY.md cadence line with the installed wr-risk-scorer machine-read contract

**Status**: proposed
**Reported**: 2026-07-20
**Problems**: P045
**ADRs**: (none)
**JTBD**: JTBD-400

## Summary

Align the RISK-POLICY.md cadence line with the installed wr-risk-scorer 0.17.0 machine-read contract (upstream ADR-091) so the commit gate honours the quarterly review cadence instead of falling back to its 14-day default.

## Driving problem trace

- P045 (RISK-POLICY staleness window hardcoded at 14 days conflicts with quarterly cadence) — the commit-gate hook nagged fortnightly regardless of the policy's user-directed quarterly cadence, forcing date-bump touch commits. Re-verification 2026-07-20 found the upstream hardcode removed in the installed wr-risk-scorer 0.17.0: the hook now parses the policy's own cadence line (`(?m)^>?\s*Reviewed\s+([A-Za-z]+)`, quarterly → 90 days, 14-day fallback only when unmatched). The residual defect is local: our cadence line `**Review cadence:** quarterly ...` does not match the regex, so the fallback still fires.

## Scope

Reformat RISK-POLICY.md's review-cadence line (line 6) from `**Review cadence:** quarterly (next review due 2026-10-06) — user-directed 2026-07-06` to the blockquote form the installed hook parses: `> Reviewed quarterly — next review due 2026-10-06 (user-directed cadence, 2026-07-06)`. All semantic content (quarterly cadence, next-due date, user-direction provenance) is preserved; only the surface format changes to satisfy the upstream ADR-091 machine-read contract. The `**Last reviewed:** 2026-07-18` date line already matches the hook's separate date regex and is untouched. Verified empirically against the 0.17.0 hook's parsing logic: the new line yields cadence `quarterly` → 90-day threshold; no other repo script or hook parses the old `**Review cadence:**` label. No upstream report is filed — the upstream fix shipped in 0.17.0 (installed 2026-07-11); the fortnightly date-bump workaround retires once the line matches.

## Stories

(stories: [] — single one-line doc edit; work-breakdown carried by this RFC's Scope per the P059-documented fix-time authoring workaround, RFC-004/RFC-005 precedent)

## Commits

(rendered from `git log --grep "Refs: RFC-006"` by `/wr-itil:manage-rfc` + `wr-itil-reconcile-rfcs` per ADR-085 — a git-log-derived view, not stored per-commit. At capture there are no commits yet.)

## Related

- P045 — driving problem ticket (`docs/problems/known-error/045-risk-policy-staleness-window-hardcoded-14-days-conflicts-quarterly-cadence.md`)
- Upstream ADR-091 / P408 (windyroad/agent-plugins) — the cadence-aware staleness contract the installed 0.17.0 hook implements
- RISK-POLICY.md quarterly-cadence amendment (commit d2ee199, 2026-07-06) — the user direction the old hardcode contradicted
