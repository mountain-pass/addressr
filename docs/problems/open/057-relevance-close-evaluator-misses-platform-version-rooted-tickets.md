# Problem 057: Relevance-close evaluator misses platform-version-rooted tickets after engine migrations

**Status**: Open
**Reported**: 2026-07-19
**Priority**: 4 (Low) — Impact: Low (2) × Likelihood: Unlikely (2) — derived at capture per Step 4a; queue-hygiene cost only, fires around platform migrations — cf. P050
**Origin**: internal
**Effort**: M — derived at capture per Step 4a; upstream evaluator shape addition + behavioural tests — cf. P050
**WSJF**: 2.0 — (4 × 1.0) / 2 — backfilled 2026-07-29 (review)
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

Relevance-close evaluator misses platform-version-rooted tickets after engine migrations. Evidence: P027 (RCA pinned to "OpenSearch 1.3.20's match_bool_prefix query builder") stayed Open through both engine migrations (1.3.20→2.19 on 2026-07-11, 2.19→3.5 cutover 2026-07-14 per ADR 035) and needed a dedicated AFK iteration (2026-07-19) to close as no-longer-relevant; P028 (OpenSearch 1.3.20 version debt) was closed manually in the 2026-07-15 review rather than auto-flagged; P035/P038 migration-era tickets were flagged manually in the same review. The wr-itil-evaluate-relevance evaluator's evidence shapes (file-no-longer-exists / ADR-shipped-confirmed / etc.) key on explicit file paths and ADR citations but have no shape for "RCA pins a platform/engine version the production stack no longer runs". Proposed fix (upstream @windyroad/itil): add a version-pin detection shape — grep ticket RCA/Description for version-pinned root-cause claims (e.g. "OpenSearch 1.3.20", "Node 18") and cross-reference against current platform version markers (terraform engine_version, package.json engines) to emit CLOSE-CANDIDATE on mismatch. Same false-negative class as the path-extraction false-positive note in the 2026-07-15 review notes; this is the missed-positive direction.

## Symptoms

(deferred to investigation)

## Workaround

(deferred to investigation)

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

(captured via /wr-itil:capture-problem during the P027 close iteration retro, 2026-07-19; expand at next investigation)

- Duplicate-check filename match (list-only, unrelated): P002 waycharter-v2-migration (resolved).
- [P027 close](../closed/027-synonym-expansion-bypasses-auto-fuzziness.md) — the driver case for this capture.
- **Reported upstream**: https://github.com/windyroad/agent-plugins/issues/391 (2026-07-25)

## Reported Upstream

- **URL**: https://github.com/windyroad/agent-plugins/issues/391
- **Reported**: 2026-07-25
- **Template used**: problem-report.yml (problem-first shape, body composed per ADR-033 structured mapping)
- **Disclosure path**: public issue
- **Dedup verdict**: `different-problem` against windyroad/agent-plugins#306 ("evaluate-relevance over-fires CLOSE-CANDIDATE on tickets that merely cite a shipped ADR") and #220 — same script, opposite direction. #306 is the false-positive/over-fire direction; this ticket is the missed-positive direction. Both are cross-referenced in the filed body so a fix for one does not regress the other.
- **Gates**: `wr-risk-scorer:external-comms` PASS; `wr-voice-tone:external-comms` PASS (rev 2 — rev 1 failed on em-dashes)
- **Cross-reference confirmed**: yes — the issue body's Cross-reference section names P057 and this repo's `docs/problems/` directory
- **Local status unchanged**: remains upstream-blocked. Reporting does not fix it locally.
