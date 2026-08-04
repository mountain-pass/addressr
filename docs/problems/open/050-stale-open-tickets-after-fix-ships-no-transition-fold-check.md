# Problem 050: Stale-Open tickets after their fix ships — no surface catches a skipped ADR-022 transition fold

**Status**: Open
**Reported**: 2026-07-16
**Priority**: 6 (Medium) — Impact: Minor (2) × Likelihood: Possible (3) — re-rated 2026-07-19 (review): now two confirmed multi-week occurrences (P026 ~3 months stale-Open; P040 ~54 days stale-Known-Error) across ~50 tickets, per this ticket's own re-rate note
**Origin**: internal
**Effort**: M — derived at capture: commit-time advisory hook + review-problems evidence-shape extension, few files — cf. P041 (M)
**WSJF**: 3.0 — (6 × 1.0) / 2
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

Stale-Open problem tickets after their fix ships — no surface catches a fix commit that skips the ADR-022 lifecycle transition. Evidence: commit 920fce6 (v2.4.0, 2026-04-20) shipped P026's fix (ADR 027 `AUTO:5,8`) citing P026 in the ADR and code comments, but did not fold the Open → Verifying transition; P026 sat Open for ~3 months, docs/problems/README.md kept ranking it as dev work (WSJF 6.0), and the 2026-07-16 AFK work-problems iteration dispatched a full investigate-and-propose iteration on the stale premise before discovering the fix was live. Two gaps compose: (a) fix commits referencing ADRs/tickets are not checked for a folded ticket transition (ADR-014/ADR-022 discipline unenforced at commit time); (b) `/wr-itil:review-problems` relevance-close (ADR-079 `ADR-shipped-confirmed` shape) never fired for P026 across ~3 months. Candidate fix shapes: commit-time advisory hook that flags a `fix(...)` commit citing P&lt;NNN&gt;/ADR-NNN without a `docs/problems/` rename in the same commit; and/or extend review-problems Step 4.6 evidence shapes to grep code comments/ADRs for "P&lt;NNN&gt;" fix citations against still-open tickets.

## Symptoms

- A fix-typed advisory never fires for a fix that shipped inside a `feat:` release commit.
- The post-release Known Error → Verifying drain skips silently for a ticket fixed by another ticket's release (`derive-release-vehicle` exit 2, no changeset reference in the ticket body — dropped without a log line).
- `evaluate-relevance` returns no close verdict for a ticket whose fix is live and whose governing ADR is ratified, because the ticket spells the citation `ADR 027` rather than `ADR-027`.
- The stale ticket keeps its dev-work WSJF rank at/near the top of the queue, and an AFK `/wr-itil:work-problems` iteration burns a full investigate-and-propose cycle on a stale premise before discovering the fix is live.

## Workaround

Periodic manual sweep cross-referencing still-open ticket IDs against commit **bodies** (not subjects):

```bash
git log --since="3 months ago" --format='%H %s%n%b' \
  | grep -oE 'P[0-9]{3}' | sort -u > /tmp/cited.txt
ls docs/problems/open docs/problems/known-error \
  | grep -oE '^[0-9]{3}' | sed 's/^/P/' | sort -u > /tmp/still-open.txt
comm -12 /tmp/cited.txt /tmp/still-open.txt
```

Each hit is a candidate for a skipped ADR-022 transition fold. Nothing schedules this sweep, so it runs only when someone remembers.

## Impact Assessment

- **Who is affected**: addressr-maintainer (queue hygiene) and any AFK `/wr-itil:work-problems` iteration, which pays a full iter cost on a stale premise.
- **Frequency**: two confirmed multi-week occurrences across ~50 tickets (P026 ~3 months, P040 ~54 days). Both found by accident, not by a surface firing.
- **Severity**: Minor. No production, data, or customer impact — wasted maintainer/agent cycles and a misranked backlog.
- **Analytics**: none.

## Root Cause Analysis

**Classification: UPSTREAM (`@windyroad/itil`). This repo is an adopter with no local `packages/` tree — all three implicated files live in the plugin.**

Hypothesis confirmed 2026-07-26 against installed `@windyroad/itil@0.59.2`. Three upstream surfaces exist to catch a ticket whose fix has already shipped. Each keys on a signal that one shape lacks: **a ticket whose fix ships incidentally, inside a commit authored for a different work item.**

| Surface                                                                      | Keys on                                                                                    | Why both occurrences slip through                                                                                                                                        |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hooks/itil-fix-title-lifecycle-advisory.sh` (upstream P345/RFC-044)         | `fix:`/`fix(` subject type + `P<NNN>` in the **subject** + ticket in `docs/problems/open/` | Both fix commits are `feat(...)`-typed; both name the fixed ticket only in the **body**; P040 was in `known-error/`, outside the glob                                    |
| `lib/enumerate-postrelease-kv-candidates.sh` (upstream P228, shipped 0.49.4) | Ticket citing **its own** `.changeset/<name>.md`                                           | An incidentally-fixed ticket has no changeset of its own → `derive-release-vehicle` exit 2 → skipped silently                                                            |
| `scripts/evaluate-relevance.sh` Shape 2 `ADR-shipped-confirmed`              | Ticket body matching `\bADR-[0-9]{3}\b` against a `human-oversight: confirmed` ADR         | P026 cites the ADR **nine times, every one as `ADR 027`** (space form) — the regex matches none. And the citation direction is ticket→ADR; here the ADR cites the ticket |

Two composing defects, cheapest first:

1. **Citation-form gap (one-line fix).** Shape 2's `\bADR-[0-9]{3}\b` misses the `ADR NNN` space form used throughout this repo's tickets and in wr-itil's own prose. Verified: `docs/problems/closed/026-*.md` carries 9 space-form citations and 0 hyphenated ones. This defect alone explains why relevance-close never fired for P026 across ~3 months.
2. **Incidental-fix gap (structural).** No surface scans in the reverse direction — commit bodies and `@problem P<NNN>` markers in ADRs/code comments, cross-referenced against tickets still in `open/` **or** `known-error/`, independent of commit type and of which ticket the commit was authored for.

### Evidence

- **P026** (~3 months in `open/`): commit `920fce6`, subject `feat(search): v2.4.0 — exact-number ranking + endpoint-only range aliases (ADR 027 + ADR 028)`. Type is `feat` (excludes the P345 hook before any token scan); `P026` appears only in the body ("Combined release resolving both halves of issue #367 / P015 / P026"); the hook reads `git log -1 --format='%s'`.
- **P040** (~54 days in `known-error/`, WSJF 20.0 at top of queue): commit `3969b9e`, subject `feat(deploy): version-control Cloudflare Worker via Terraform (P042, ADR 032)`. Subject names P042; `P040` appears only in the body ("the P040 regression guard"). Out of the P345 hook's `open/` glob; no own-changeset citation for the P228 drain.

### Fix Strategy

Not implementable locally — no `packages/` tree. Reported upstream as windyroad/agent-plugins#394 with two suggested pieces (regex widening; reverse-citation shape with a false-positive guard, advisory-only per ADR-092). Local status remains **upstream-blocked**.

### Investigation Tasks

- [x] Investigate root cause _(2026-07-26 — three-surface gap analysis confirmed against `@windyroad/itil@0.59.2`; see table above)_
- [x] Classify fix locus _(2026-07-26 — UPSTREAM; no local `packages/` tree)_
- [x] Report upstream _(2026-07-26 — filed as [windyroad/agent-plugins#394](https://github.com/windyroad/agent-plugins/issues/394); see `## Reported Upstream`)_
- [ ] Re-verify against the next `@windyroad/itil` release carrying a fix, then transition

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: (none)

## Related

- [P026](../closed/026-numeric-fuzziness-inflates-ranking.md) — the stale-Open instance that surfaced this gap (transitioned Open → Verifying 2026-07-16, commit dd34e04).
- [ADR 027](../../decisions/027-fuzziness-auto-5-8.proposed.md) + commit `920fce6` — the fix commit that skipped the transition fold.
- Hang-off-check subagent dispatch skipped at capture: mechanical pre-filter matched &gt;5 candidate tickets sharing ADR/skill/path signals (P027, P029, P039, P045, P046, P026, P036, P042, …) — re-evaluate absorption at next `/wr-itil:review-problems` per the capture-problem Step 2b candidate-cap contract.
- Captured via `/wr-itil:capture-problem` from the P026 iteration retro (Step 4b Stage 1); expand at next investigation.
- [P040](../closed/040-uptime-robot-401-api-addressr-missing-proxy-auth.md) — second confirmed instance (2026-07-18 iter retro): P040's fix shipped 2026-05-25 via the P042 Terraform cutover (commit 3969b9e) but the K→V transition fold was skipped; the ticket sat Known Error ~54 days ranked WSJF 20.0 at the top of the dev-work queue until the 2026-07-18 AFK iteration discovered the fix was live. Likelihood may warrant re-rate from Unlikely (2) at next review — two confirmed occurrences across ~50 tickets, both multi-week.
- [P057](057-relevance-close-evaluator-misses-platform-version-rooted-tickets.md) — sibling upstream ticket against the same `evaluate-relevance` evaluator, same missed-positive direction, different signal (version-pin vs reverse fix-citation). Filed upstream as windyroad/agent-plugins#391.
- **Reported upstream**: https://github.com/windyroad/agent-plugins/issues/394 (2026-07-26)

## Reported Upstream

- **URL**: https://github.com/windyroad/agent-plugins/issues/394
- **Reported**: 2026-07-26
- **Template used**: problem-report.yml (problem-first shape, body composed per ADR-033 structured mapping)
- **Disclosure path**: public issue
- **Dedup verdict**: `different-problem` against #42 (closed, shipped as upstream P228 in 0.49.4 — the post-release K→V drain keys on the ticket citing its **own** changeset, which is exactly the signal the incidental-fix shape lacks, so occurrence 2 survives that fix), #391 (same evaluator, same missed-positive direction, version-pin signal), and #306 (same evaluator, opposite over-fire direction — cross-referenced in the filed body so a fix for one does not regress the other).
- **Gates**: `wr-risk-scorer:external-comms` PASS; `wr-voice-tone:external-comms` PASS (both drafted em-dash-free from the start; no rejection round-trip)
- **Cross-reference confirmed**: yes — the issue body's Cross-reference section names P050 and this repo's `docs/problems/` directory
- **Local status unchanged**: remains upstream-blocked. Reporting does not fix it locally. Status held at Open rather than folded to Known Error, matching the P057 upstream-blocked precedent.
