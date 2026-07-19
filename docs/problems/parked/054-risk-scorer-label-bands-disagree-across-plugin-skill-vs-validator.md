# Problem 054: wr-risk-scorer label bands disagree across the plugin (update-policy skill vs policy-validator)

**Status**: Parked
**Reported**: 2026-07-18
**Priority**: 4 (Low) — Impact: 2 (Minor — the label for score 5 differs across surfaces; affects severity display + appetite reasoning, not the enforced gate numeric) × Likelihood: 2 (Unlikely to bite in practice, though structurally present on every policy) — derived at capture
**Origin**: internal (upstream plugin inconsistency)
**Effort**: M — derived at capture (reconcile bands across skill + validator + pipeline.md)
**WSJF**: 4.0 — (4 × 2.0) / 2 (Known Error transition 2026-07-19 review: root cause confirmed 2026-07-18; validator-accepted band set retained as workaround)
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

The wr-risk-scorer plugin is internally inconsistent about the score-to-label bands. The `update-policy` SKILL.md step 5 cites ADR-086 bands (1-2 Very Low, 3-5 Low, 6-9 Medium, 10-16 High, 17-25 Very High) and explains that the Low ceiling at 5 exists so an appetite of 5 is reachable for severe-but-rare Impact-5 / Likelihood-1 risks. But the `wr-risk-scorer:policy` validator agent accepts an adopter policy whose bands are 1-2 Very Low, 3-4 Low, 5-9 Medium, 10-16 High, 17-25 Very High (placing 5 in Medium, not Low) and describes those as matching "the reference bands." So the skill and the validator disagree on where score 5 sits. Observed 2026-07-18 while amending addressr's RISK-POLICY.md (P047 fix): the validator PASSed a policy carrying "5-9 Medium".

## Symptoms

- An adopter following update-policy step 5 (ADR-086) gets 3-5 Low / 6-9 Medium.
- An adopter whose policy has 5-9 Medium passes the validator (RISK_VERDICT: PASS) with no flag.
- Score 5 is labelled Low by the skill and Medium by the validator; the ADR-086 rationale that "appetite 5 is reachable within Low" only holds if 5 is in the Low band.

## Workaround

Pick one band set and align update-policy step 5, the wr-risk-scorer:policy validator, and pipeline.md so the label for score 5 is consistent. addressr currently carries "5-9 Medium" (validator-accepted).

## Impact Assessment

- **Who is affected**: addressr-maintainer (and any wr-risk-scorer adopter authoring or validating a RISK-POLICY.md)
- **Frequency**: structurally present on every policy authored/validated; rarely changes an outcome
- **Severity**: low — a display/reasoning inconsistency, not an enforced-gate divergence
- **Analytics**: N/A

## Root Cause Analysis

**Confirmed 2026-07-18.** update-policy SKILL.md step 5 states ADR-086 "3-5 Low, 6-9 Medium"; the wr-risk-scorer:policy validator approved "3-4 Low, 5-9 Medium" as matching "the reference bands", RISK_VERDICT: PASS, no drift flag. Upstream fix: reconcile to a single band definition across the skill, the validator, and pipeline.md.

**Re-verified 2026-07-19 (AFK iteration).** The split is fully live in the latest installed plugin version (0.17.0): `skills/update-policy/SKILL.md` (lines 115-117) and `agents/pipeline.md` (line 445, citing ADR-086) both say 3-5 Low / 6-9 Medium, while `agents/policy.md` (line 43), `agents/plan.md` (line 125), and `agents/wip.md` (line 148) all say 3-4 Low / 5-9 Medium. Upstream issue windyroad/agent-plugins#366 is OPEN with zero comments. Nothing remains actionable in this repo: the local RISK-POLICY.md carries the validator-accepted 5-9 Medium bands plus the explicit "inclusive; blocks only scores strictly above 5" gate wording (P047 fix), so the enforced-gate semantics are unambiguous locally regardless of which label set upstream converges on.

Note: the 2026-07-19 review-sweep relevance evaluator's CLOSE-CANDIDATE caveat that reached the AFK orchestrator for this ticket ("driver P007 closed; 3 of 8 tasks done; ADR-026 fix shipped in v2.3.0") describes P015, not P054 — a briefing cross-wire, further evidence for P057 (evaluator unreliability). P054 is NOT a close candidate: the defect is unfixed upstream.

### Investigation Tasks

- [x] Confirm the skill/validator band disagreement — done (this session: update-policy SKILL.md text vs the validator PASS on 5-9 Medium)
- [x] Re-verify against latest installed plugin version — done 2026-07-19 (0.17.0 still split; #366 open, unacknowledged)

## Dependencies

- **Blocks**: (none)
- **Blocked by**: upstream — fix lives in the `wr-risk-scorer` plugin, not this repo
- **Composes with**: P053 (same appetite-boundary confusion around score 5)

## Related

- Discovered during the P047 (closed) verification + fix, 2026-07-18.
- **Reported upstream**: https://github.com/windyroad/agent-plugins/issues/366 (2026-07-18)

## Parked

- **Reason**: upstream-blocked — the fix (reconciling the band set across update-policy SKILL.md, the policy/plan/wip validator agents, and pipeline.md) lives entirely in the `@windyroad/risk-scorer` plugin. Verified still broken in 0.17.0 on 2026-07-19. No local work remains: addressr's RISK-POLICY.md already carries a validator-accepted band set with unambiguous gate wording.
- **Un-park trigger**: windyroad/agent-plugins#366 resolved, or a wr-risk-scorer release ships reconciled bands (then re-check RISK-POLICY.md's band table against the reconciled set and close).
- **Parked**: 2026-07-19

## Reported Upstream

- **URL**: https://github.com/windyroad/agent-plugins/issues/366
- **Reported**: 2026-07-18
- **Template used**: problem-report.yml (problem-shaped structured body)
- **Disclosure path**: public issue
- **Cross-reference confirmed**: yes (issue body records the P054 downstream reference)
