# Problem 061: work-problems iter briefing carries another ticket's evaluator caveat

**Status**: Open
**Reported**: 2026-07-19
**Priority**: 4 (Low) — Impact: 2 (Minor — worst case is a blind close of an unfixed ticket, reversible via `/wr-itil:transition-problem <NNN> known-error` + git history; no service impact) × Likelihood: 2 (observed once; structurally possible on any iter dispatched for a ticket while caveats exist for other tickets) — derived at capture
**Origin**: internal
**Effort**: M — derived at capture (upstream orchestrator briefing-assembly investigation + upstream report; local mitigation already documented)
**JTBD**: JTBD-400 (re-anchored from the wr-itil plugin's own JTBD-006 — a plugin job ID leaked into this ticket at capture; user decision 2026-07-24)
**Persona**: addressr-maintainer

## Description

work-problems AFK orchestrator dispatched the P054 iter briefing carrying ANOTHER ticket's relevance-evaluator caveat: the iter prompt stated "the Step 3.6 relevance evaluator flagged P054 as CLOSE-CANDIDATE-WITH-CAVEAT (driver P007 closed; 3 of 8 tasks done, 5 outstanding)" and cited "ADR-026 fix shipped in v2.3.0" — every element of that caveat belongs to P015 per docs/problems/README.md Review notes (the caveated CLOSE-CANDIDATE list names P015 with "driver P007 closed"; P054 is absent from that list entirely; the 2026-07-19 review sweep's P015 re-rate cites ADR 026 shipped / v2.3.0). P054's actual state was an unfixed upstream defect (band-label split live in wr-risk-scorer 0.17.0, agent-plugins#366 open). An iter agent trusting the briefing without re-deriving from the ticket file + README could blind-close an unfixed ticket — the exact "progress the backlog while I'm away" trust failure that JTBD-400's ship-releases-reliably-from-trunk job depends on. Class-of-behaviour: orchestrator Step 3.6 → Step 5 iter-briefing assembly cross-wires per-ticket evaluator metadata; sibling of the P057 evaluator-unreliability class but a distinct defect with a distinct fix locus (the `@windyroad/itil` work-problems orchestrator's briefing assembly, not the evaluator itself — upstream).

## Symptoms

- The 2026-07-19 P054 iter prompt carried "CLOSE-CANDIDATE-WITH-CAVEAT (driver P007 closed; 3 of 8 tasks done, 5 outstanding)" + "ADR-026 fix shipped in v2.3.0" — all P015 facts.
- docs/problems/README.md Review notes list P015 (not P054) in the Caveated CLOSE-CANDIDATEs section; P054 was auto-transitioned Open → Known Error in the same sweep with no caveat.
- The iter's own evidence check (wr-risk-scorer 0.17.0 source + agent-plugins#366 state) contradicted the briefing outright.

## Workaround

Iter agents verify any CLOSE-CANDIDATE caveat in the dispatch briefing against the docs/problems/README.md "Caveated CLOSE-CANDIDATEs" list AND re-derive the ticket's state from its file + primary evidence before acting (briefing note added to docs/BRIEFING.md "What Will Surprise You", 2026-07-19). The orchestrator's own "evaluator unreliable — investigate on real evidence" framing partially mitigates, but does not prevent the misattribution itself.

## Impact Assessment

- **Who is affected**: addressr-maintainer (trust in AFK loop dispositions); any `@windyroad/itil` work-problems adopter
- **Frequency**: observed once (2026-07-19); exposure on every AFK iter dispatched while caveats exist for other tickets
- **Severity**: Low — blind close is reversible; caught this time by evidence re-derivation
- **Analytics**: N/A

## Root Cause Analysis

### Investigation Tasks

- [ ] Locate the cross-wire in the work-problems orchestrator Step 3.6 → Step 5 briefing assembly (upstream `@windyroad/itil`)
- [ ] Report upstream via /wr-itil:report-upstream once locus is confirmed
- [ ] Create reproduction test

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: P057 (sibling evaluator-unreliability class — evaluator evidence-shape gap vs orchestrator metadata misattribution)

## Related

- Captured via /wr-itil:capture-problem during the P054 AFK iter retro (2026-07-19).
- Hang-off-check verdict: PROCEED_NEW. P057 (Relevance-close evaluator misses platform-version-rooted tickets) is a sibling, not a parent — its defect is a missed-positive evidence-shape gap inside the `wr-itil-evaluate-relevance` evaluator, with the fix inside the evaluator; this ticket's evaluator output was per-ticket correct (the caveat genuinely belonged to P015) and the defect is downstream in the orchestrator's briefing assembly attaching it to the wrong ticket. P050 (stale-Open transition-fold check) shares only lifecycle vocabulary — opposite failure direction (work on already-fixed tickets vs blind-close of unfixed ones). Cluster relationship for the "trust-the-pipeline" family deferred to the next /wr-itil:review-problems pass.
- P054 (wr-risk-scorer label bands disagree — the mis-briefed iter's ticket, parked upstream-blocked same day).
- P015 (the ticket the caveat actually described).
