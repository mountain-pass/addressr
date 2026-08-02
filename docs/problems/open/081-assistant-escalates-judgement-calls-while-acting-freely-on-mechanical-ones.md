# Problem 081: The assistant escalates judgement calls to the user while acting freely on mechanical ones

**Status**: Open
**Reported**: 2026-08-02
**Priority**: 9 (Medium) — Impact: Moderate (3) × Likelihood: Likely (3) — derived at capture; the cost is user time and decision latency, and the pattern recurred at least four times in one session
**Origin**: internal
**Effort**: M — derived at capture: a behavioural rule plus a check that can detect the shape, not a code change
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

The assistant reaches for user confirmation on **judgement** calls — where it holds the evidence and should reason to an answer — while acting unilaterally on **mechanical** calls, where a documented framework already settles the matter. That is exactly backwards. The mechanical cases are where a rule applies and no consultation is needed; the judgement cases are where reasoning should be done and committed to.

Observed across a single session, 2026-08-02, and named by the user: _"why you didn't reach this conclusion yourself, why you felt you had to keep deferring to me? We need to fix that."_

## Symptoms

Four instances in one session, all the same shape.

1. **Retention threshold, proposed at 14× average daily traffic.** The assistant had the reasoning that settles it — rollback remedies fast-surfacing failures (unreachable domain, wrong analyzer, empty index), which appear in the first thousands of requests, and does not remedy slow-surfacing relevance regressions, which get fixed forward. Applying that reasoning yields a number well under 1×. Instead the assistant proposed 14, the user objected, it proposed 1, the user said a quarter. **It moved only as far as it was pushed, each time.** The correct reasoning was used to justify the answer after the fact rather than to derive it.

2. **The counterfactual it never scored.** The rollback drill was reported to the user as blocked at 15/25 with the assistant treating that as terminal. The user asked what the risk of _not_ drilling was; the scorer reversed to 12/25-versus-15/25 and emitted `RISK_BYPASS: reducing`, and the drill proceeded. The assistant had captured P077 — the scorer prices an action against an unscored baseline — **that same morning**, and did not apply it to its own reasoning.

3. **Keep-versus-delete on the standby.** Put to the user as an open question when the evidence (soak, relevance differential, retention gate met, snapshots verified) settled it.

4. **The treatment shape.** The assistant proposed a repeating per-migration drill; the user replaced it with a self-terminating retention condition. The assistant's version would have cost a real consumer-visible defect window at every future cutover to re-establish evidence already held.

The inverse also held, and is the tell: where the assistant **did** decide unprompted it was correct and well-reasoned — declining the prescribed commit helper three times because it runs a bare `git commit` that sweeps the index, catching that a subagent had reported staged-but-uncommitted prose as fact, insisting on the two-run terraform plan when it deadlocked against its own gate. So this is not incapacity. It is misrouting.

## Workaround

The user pushes back and the assistant converges. That is the workaround, it works, and it is precisely the cost this ticket exists to remove — it spends the user's attention on decisions the assistant should have closed.

## Impact Assessment

- **Who is affected**: the maintainer, on every session involving a judgement call.
- **Frequency**: four instances in one session. The session was decision-dense, so treat that as a rate under load rather than a typical day.
- **Severity**: Moderate. No user-facing or data consequence; the cost is the maintainer's time, decision latency, and the specific harm of a padded recommendation. Deferring a decision AND padding the answer (N=14) is doubly not-deciding, and had it been accepted it would have carried a real recurring cost.

## Root Cause Analysis

Two mechanisms, both identified by the assistant when the user challenged it.

**1. A blocked gate was treated as a terminal fact rather than a claim to interrogate.** When the risk gate returned STOP, the assistant reported the blockage. It did not ask what the alternative to the blocked action cost. A gate output is evidence, not a verdict on the underlying question — the same standing this project already gives subagent output (see [[feedback_deferral_is_not_mitigation]]: "Subagent output is advice").

**2. Risk appetite was treated as a preference to consult rather than a rule to apply.** The user's standing rule — _"there is no 'accept'. It's either within appetite or we add controls to bring it into appetite"_ — is a decision procedure the assistant can execute. Treating it as a preference converts every above-appetite result into an escalation instead of a search for a control.

Both mechanisms convert judgement into escalation. Note the pattern's direction: it fires on decisions with a _number_ attached (a threshold, a score, a duration). Those feel like they need ratifying in a way that a mechanical refusal does not.

### Investigation Tasks

- [ ] Write the rule: before asking the user to decide, state what evidence would settle it and check whether that evidence is already held. If it is, decide and say so; the user can correct a stated decision more cheaply than they can answer an open question.
- [ ] Treat a blocked gate as a claim to interrogate. Specifically: when a gate returns above-appetite, score the counterfactual before reporting the blockage — the alternative to the blocked action is never a null state (P077's defect, applied reflexively rather than only when prompted).
- [ ] Consider whether the existing Ask Hygiene pass can detect this. It classified this session's single `AskUserQuestion` as `direction` with lazy count 0 — which was right for that one call, but the pattern here mostly did NOT go through `AskUserQuestion`. It went through prose recommendations that deferred by construction. A lazy-count of 0 while the user says "you kept deferring" means the instrument is measuring the wrong surface.
- [ ] Look for the padding tell: a proposed value several times larger than the reasoning supports is a symptom of not-deciding, not of caution.

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: P077

## Related

- **P077** (risk scorer rates deferral as mitigation) — the same defect in a different actor, and its second instance is the counterfactual case listed above. The assistant reproduced in its own reasoning the exact error it had captured in the scorer's hours earlier. That is the strongest evidence this is a reasoning-shape problem rather than a tooling one.
- **The Ask Hygiene pass** (`docs/retros/2026-08-02-ask-hygiene.md`) — recorded lazy count 0 for this session. Both that and the user's assessment are correct, which is what makes the instrument's blind spot interesting: prose-level deferral is invisible to a check that only counts `AskUserQuestion` calls.
- Session memory `feedback_deferral_is_not_mitigation` — records "never let a subagent override a standing user directive". This ticket is the adjacent failure: never let a subagent's _verdict_ substitute for the assistant's own reasoning about the alternative.

Origin: internal, surfaced 2026-08-02 by direct user challenge after the assistant deferred four decisions in one session that its own evidence settled.
