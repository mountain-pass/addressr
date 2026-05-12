# Incident I001: v2 OpenSearch populate — QLD and WA state jobs failed

**Status**: Investigating
**Reported**: 2026-05-12 21:01 UTC
**Severity**: 8 (Moderate) — Impact: Moderate (4) x Likelihood: Likely (2)
**Scope**: v2 OpenSearch domain `search-addressr4`; ADR 029 cutover gate evaluation. No user-visible impact (v1 serves all production traffic).

## Timeline

- [2026-05-12 11:36 UTC] Populate workflow run 25731879773 triggered via `gh workflow run "Populate Search Domain"` with target=v2, states=all
- [2026-05-12 ~14:14 UTC] QLD job started, failed on Upload step
- [2026-05-12 ~17:00 UTC] WA job started, failed on Upload step
- [2026-05-12 ~20:30 UTC] Run completed; conclusion=failure (2 of 9 state matrix jobs failed)
- [2026-05-12 21:01 UTC] Incident declared

## Observations

- [2026-05-12 ~20:30 UTC] `gh api .../actions/runs/25731879773/jobs` returns conclusion=failure for `populate (QLD) / update` and `populate (WA) / update`. Other 7 state matrix jobs succeeded.
- [2026-05-12 21:00 UTC] `curl /addressr/_count` on v2 cluster: 11.5M docs (70% of v1's expected 16.8M). Missing rows correspond to QLD + WA populations.
- [2026-05-12 21:00 UTC] `/debug/shadow-config` shows 232 successes / 12 failures (95% success rate) — shadow searches against partial v2 data are 95% answerable.
- [2026-05-12] No specific failure step logs captured yet — `gh run view --log-failed` returned empty for both QLD and WA in earlier checks. Need targeted log fetch on the failed jobs to ground the hypotheses.

## Hypotheses

- [ranked 1] **Slow data.gov.au G-NAF fetch on larger states triggers an in-loader timeout**. Evidence: QLD and WA are 4th and 5th largest states by address count. ACT (smallest), NT, OT, TAS, SA, NSW, VIC all succeeded; QLD and WA are the two that hit the failure mode. Step name "Upload" succeeded for the other states with the same loader version, suggesting the failure correlates with state size + G-NAF fetch latency rather than a code regression. Confidence: medium.
- [ranked 2] **Memory pressure on the GHA runner during large bulk-index batches**. Evidence: GHA `ubuntu-latest` runners have ~7 GB RAM; QLD's index is ~3M docs + ranges + localities. The loader holds a parsed PSV slice in memory before bulk-indexing. ACT/NT/OT/TAS are far smaller so fit comfortably. VIC succeeded which weakens this — VIC is the largest. Confidence: low-medium.
- [ranked 3] **Transient OpenSearch cluster contention during sequential matrix**. Evidence: the workflow has `max-parallel: 1` — but the v2 cluster was under cumulative bulk-load pressure by the time QLD and WA ran. /addressr/\_count returned 504 Gateway Time-out during the VIC ingest window, evidence of cluster strain. Confidence: low.

## Mitigation attempts

_(none yet — incident just declared)_

## Linked Problem

_(none yet — added on restore transition)_

## Related

- **P036** — v2 shadow auth silent regression; necessitated the full populate after master password rotation + cluster recreate.
- **ADR 029** — two-phase blue/green OpenSearch upgrade; soak gate at step 7 is blocked while v2 coverage is incomplete.
- **ADR 031** — read-shadow soak validation; the shadow success rate (95%) is computed against partial v2 data, which distorts the soak signal.
- **Populate run** — `gh run view 25731879773 --repo mountain-pass/addressr`
