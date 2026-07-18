# Problem 050: Stale-Open tickets after their fix ships — no surface catches a skipped ADR-022 transition fold

**Status**: Open
**Reported**: 2026-07-16
**Priority**: 4 (Low) — Impact: Minor (2) × Likelihood: Unlikely (2) — derived at capture: maintainer-workflow harm only (no consumer impact), one confirmed occurrence across ~50 tickets, but each occurrence silently corrupts WSJF ranking for months — cf. P041 (4, Low)
**Origin**: internal
**Effort**: M — derived at capture: commit-time advisory hook + review-problems evidence-shape extension, few files — cf. P041 (M)
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

Stale-Open problem tickets after their fix ships — no surface catches a fix commit that skips the ADR-022 lifecycle transition. Evidence: commit 920fce6 (v2.4.0, 2026-04-20) shipped P026's fix (ADR 027 `AUTO:5,8`) citing P026 in the ADR and code comments, but did not fold the Open → Verifying transition; P026 sat Open for ~3 months, docs/problems/README.md kept ranking it as dev work (WSJF 6.0), and the 2026-07-16 AFK work-problems iteration dispatched a full investigate-and-propose iteration on the stale premise before discovering the fix was live. Two gaps compose: (a) fix commits referencing ADRs/tickets are not checked for a folded ticket transition (ADR-014/ADR-022 discipline unenforced at commit time); (b) `/wr-itil:review-problems` relevance-close (ADR-079 `ADR-shipped-confirmed` shape) never fired for P026 across ~3 months. Candidate fix shapes: commit-time advisory hook that flags a `fix(...)` commit citing P&lt;NNN&gt;/ADR-NNN without a `docs/problems/` rename in the same commit; and/or extend review-problems Step 4.6 evidence shapes to grep code comments/ADRs for "P&lt;NNN&gt;" fix citations against still-open tickets.

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

- [P026](../verifying/026-numeric-fuzziness-inflates-ranking.md) — the stale-Open instance that surfaced this gap (transitioned Open → Verifying 2026-07-16, commit dd34e04).
- [ADR 027](../../decisions/027-fuzziness-auto-5-8.proposed.md) + commit `920fce6` — the fix commit that skipped the transition fold.
- Hang-off-check subagent dispatch skipped at capture: mechanical pre-filter matched &gt;5 candidate tickets sharing ADR/skill/path signals (P027, P029, P039, P045, P046, P026, P036, P042, …) — re-evaluate absorption at next `/wr-itil:review-problems` per the capture-problem Step 2b candidate-cap contract.
- Captured via `/wr-itil:capture-problem` from the P026 iteration retro (Step 4b Stage 1); expand at next investigation.
- [P040](../verifying/040-uptime-robot-401-api-addressr-missing-proxy-auth.md) — second confirmed instance (2026-07-18 iter retro): P040's fix shipped 2026-05-25 via the P042 Terraform cutover (commit 3969b9e) but the K→V transition fold was skipped; the ticket sat Known Error ~54 days ranked WSJF 20.0 at the top of the dev-work queue until the 2026-07-18 AFK iteration discovered the fix was live. Likelihood may warrant re-rate from Unlikely (2) at next review — two confirmed occurrences across ~50 tickets, both multi-week.
