# Incident I001: v2 OpenSearch populate — QLD and WA state jobs failed

**Status**: Restored
**Reported**: 2026-05-12 21:01 UTC
**Severity**: 8 (Moderate) — Impact: Moderate (4) x Likelihood: Likely (2)
**Scope**: v2 OpenSearch domain `search-addressr4`; ADR 029 cutover gate evaluation. No user-visible impact (v1 serves all production traffic).

## Timeline

- [2026-05-12 11:36 UTC] Populate workflow run 25731879773 triggered via `gh workflow run "Populate Search Domain"` with target=v2, states=all
- [2026-05-12 ~14:14 UTC] QLD job started, failed on Upload step
- [2026-05-12 ~17:00 UTC] WA job started, failed on Upload step
- [2026-05-12 ~20:30 UTC] Run completed; conclusion=failure (2 of 9 state matrix jobs failed)
- [2026-05-12 21:01 UTC] Incident declared
- [2026-05-12 21:15 UTC] Mitigation attempt: retry just QLD + WA via populate-search-domain workflow with states=QLD,WA (run 25762661760)

## Observations

- [2026-05-12 ~20:30 UTC] `gh api .../actions/runs/25731879773/jobs` returns conclusion=failure for `populate (QLD) / update` and `populate (WA) / update`. Other 7 state matrix jobs succeeded.
- [2026-05-12 21:00 UTC] `curl /addressr/_count` on v2 cluster: 11.5M docs (70% of v1's expected 16.8M). Missing rows correspond to QLD + WA populations.
- [2026-05-12 21:00 UTC] `/debug/shadow-config` shows 232 successes / 12 failures (95% success rate) — shadow searches against partial v2 data are 95% answerable.
- [2026-05-12 21:04 UTC] QLD job 75580100859 log inspected via user-supplied screenshot of github.com/.../runs/25731879773/job/75580100859. The actual failure is `snapshot_in_progress_exception` from the OpenSearch client:

  ```
  ResponseError: snapshot_in_progress_exception:
    [snapshot_in_progress_exception] Reason: Cannot close indices that
    are being snapshotted: [[addressr/PvDh7NxkTpWGEM6MNGLBDQ]].
    Try again after snapshot finishes or cancel the currently running
    snapshot.
      at onBody (@opensearch-project/opensearch/lib/Transport.js:426:23)
      ...
  body.error.type = 'snapshot_in_progress_exception'
  statusCode: 400
  ```

  The loader's `close index → update settings → reopen → bulk-index` pattern raced with AWS-managed automated snapshots on the v2 cluster. AWS-managed OpenSearch domains take automated snapshots hourly; index close requires no snapshot in progress for the target index.

## Hypotheses

- [ranked 1, **CONFIRMED**] **Loader's close-index operation races with AWS-managed automated snapshots.** Evidence: QLD job log shows `snapshot_in_progress_exception` from `Transport.js:426:23` (in the OpenSearch client) wrapping a `400 Bad Request` from the cluster. Hourly AWS-managed snapshots are the only thing that produces this error class. ACT/NSW/NT/OT/SA/TAS/VIC succeeded because their close operations didn't overlap a snapshot window; QLD and WA each happened to land inside an active snapshot. Confidence: high (direct error message).
- [ranked 2, DISCONFIRMED] ~~Slow data.gov.au G-NAF fetch / loader timeout~~ — failure was on the close-index API call, not on G-NAF fetch.
- [ranked 3, DISCONFIRMED] ~~GHA runner memory pressure~~ — failure was HTTP 400 from the cluster, not an OOM from the runner.
- [ranked 4, DISCONFIRMED] ~~OpenSearch cluster contention~~ — partially related (the snapshot _is_ cluster activity) but the failure is specific to the index-close-during-snapshot conflict, not generic contention.

## Mitigation attempts

- [2026-05-12 21:15 UTC] Retry just QLD + WA via populate-search-domain workflow with states=QLD,WA (run 25762661760). Reversible — loader is idempotent by G-NAF source ID; partial loads merge cleanly. Reasoning: snapshot windows are short (typically <60s); sequential matrix re-run gives both states fresh attempts at potentially-snapshot-quiet windows. If both succeed: incident moves to restored. If either fails again with snapshot_in_progress_exception: escalate to a forward fix (loader retry-on-snapshot_in_progress with backoff, separate problem ticket). → pending verification

## Linked Problem

**P037** — `docs/problems/037-loader-index-close-races-snapshot-no-retry.open.md` — captures the loader root cause (close-index races snapshots; no retry). Stays Open after I001 restored because the loader fix applies to v1's loader path independently of v2.

Also linked (parked alongside this incident): **P036** (FGAC clobber pattern) and **P038** (scale-back tracker) — both parked 2026-05-14 as superseded by the ADR 029 Phase 1 rollback decommission. They un-park if Phase 1 is re-attempted.

## Restored

**Restoration signal**: ADR 029 Phase 1 rolled back 2026-05-14 — the v2 populate workflow (the surface on which QLD + WA failed) no longer needs to run because the v2 domain is being decommissioned. The incident's failure surface is removed by decommission, not by fixing the failure. The underlying loader bug (close-index race + no retry on snapshot_in_progress) remains tracked by P037 and will apply to a future Phase 1 re-attempt's populate workflow if it isn't fixed first.

**Restored**: 2026-05-14

## Related

- **P036** — v2 shadow auth silent regression; necessitated the full populate after master password rotation + cluster recreate.
- **ADR 029** — two-phase blue/green OpenSearch upgrade; soak gate at step 7 is blocked while v2 coverage is incomplete.
- **ADR 031** — read-shadow soak validation; the shadow success rate (95%) is computed against partial v2 data, which distorts the soak signal.
- **Populate run** — `gh run view 25731879773 --repo mountain-pass/addressr`
