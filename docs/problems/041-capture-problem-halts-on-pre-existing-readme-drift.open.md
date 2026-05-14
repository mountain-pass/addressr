# Problem 041: `/wr-itil:capture-problem` Halts on Pre-Existing README Drift Instead of Capturing

**Status**: Open
**Reported**: 2026-05-14
**Priority**: 3 (Medium) — Impact: 3 x Likelihood: 1 (deferred — re-rate at next /wr-itil:review-problems)
**Effort**: M (deferred — re-rate at next /wr-itil:review-problems)
**Type**: technical

## Description

`/wr-itil:capture-problem`'s Step 0 README-reconciliation preflight halts the capture when `wr-itil-classify-readme-drift` returns `HALT_ROUTE_RECONCILE` (`classify_exit=1`) for **pre-existing committed cross-session drift** — even though capture-problem itself, by design, does not refresh `docs/problems/README.md` and so cannot cause new drift.

Observed 2026-05-14: a previous in-session `/wr-itil:capture-problem` invocation captured P039 (which deliberately defers README refresh per the lightweight-capture contract — that is the load-bearing distinction from `/wr-itil:manage-problem`). A subsequent `/wr-itil:review-problems` that would have refreshed the README was interrupted before its Step 5 README rewrite. The README was therefore one row behind on-disk state. When the user issued a second `/wr-itil:capture-problem` in the same session, Step 0 ran `wr-itil-reconcile-readme docs/problems` → `exit=1` (`MISSING P039 wsjf-rankings`), then `wr-itil-classify-readme-drift` → `classify_exit=1` (`HALT_ROUTE_RECONCILE uncovered=1`). Per the skill contract the capture halted and the user was forced to choose between running `/wr-itil:reconcile-readme` first, completing the prior `/wr-itil:review-problems`, or overriding the halt.

This defeats the lightweight-capture contract. The whole point of `capture-problem` (per ADR-032) is "user observes something ticket-worthy, captures it fast, continues working". Halting on **someone else's deferred refresh** turns capture-time into reconciliation-time and forces the user to resolve unrelated state before they can write down the new observation.

Notably the drift here was **created by the same skill on a prior invocation** — capture-problem's intentional deferral of README refresh became capture-problem's blocker. Two captures in one session against a stale README is a normal workflow (especially during retros, code reviews, AFK orchestrator runs); blocking the second one is friction the skill imposes on itself.

## Symptoms

- After any `/wr-itil:capture-problem` that defers README refresh, a second `/wr-itil:capture-problem` in the same session (or any later session before reconciliation) halts at Step 0.
- The halt message correctly tells the user to run `/wr-itil:reconcile-readme` or `/wr-itil:review-problems`, but neither resolves the original "I want to write this down right now" intent.
- AFK orchestrators that batch multiple captures hit this on every capture after the first if README refresh is not interleaved.

## Workaround

The user can override the halt verbatim ("capture the problem anyway"). The skill then proceeds normally — the create-gate marker, ID compute, write, and commit all work fine without README being current. The halt is the only thing the preflight contributes; the capture itself does not require README to be in sync.

Alternative workarounds:

- Run `/wr-itil:reconcile-readme` first, then re-invoke capture-problem.
- Complete an outstanding `/wr-itil:review-problems` if one is in flight.

## Impact Assessment

- **Who is affected**: Addressr Contributor/Maintainer when invoking `/wr-itil:capture-problem` for the second+ time in a session, or after a prior session that didn't reconcile. AFK orchestrators that batch captures.
- **Frequency**: Hits on every capture after the first within a reconciliation window. Likely every session that captures more than one ticket. The lightweight-capture contract makes this the default workflow.
- **Severity**: Low — pure process friction. No data loss; the skill can be overridden. But friction defeats the design intent of the skill (capture-and-continue), so the bar for "is this worth fixing" is "does it make capture-problem stop feeling lightweight". It does.
- **Analytics**: N/A — friction event, not a measurable product event.

## Root Cause Analysis

### Why Step 0 halts on pre-existing drift

Per the skill contract: "the preflight is purely a fail-fast on pre-existing drift." The reasoning is that compounding stale README state with a second deferred capture makes the eventual reconciliation harder. That reasoning has some merit but it traded one user-experience problem (eventual reconciliation cost) for a worse one (immediate halt blocking the user's stated intent).

### Why the halt is wrong-shaped

Capture-problem is documented as the lightweight aside-invocation surface. The README refresh is deferred **by design** to keep capture fast. The Step 0 halt then makes the second capture **not fast** — it bounces the user out into a heavyweight reconciliation flow, which is exactly what the skill is positioned not to require.

The drift the preflight catches in this case is itself the skill's normal output. Treating capture-problem's own intentional deferral as a hard-blocking pre-existing-drift signal is a structural mismatch.

### Possible fix shapes (not yet chosen)

1. **Tolerant Step 0**: classify the drift, and if every uncovered row is a `.open.md` ticket file that exists on disk (i.e., the drift is the "deferred refresh" pattern this skill itself creates), proceed with capture without halting. Report the drift in the trailing pointer so the user knows the next `/wr-itil:review-problems` has more work to do. Halt only on drift the skill could not have produced (e.g., orphaned README rows referencing non-existent files, or missing rows for non-`.open.md` files).
2. **Capture-then-route**: do the capture first, then on Step 7 print "drift detected, run `/wr-itil:reconcile-readme` or `/wr-itil:review-problems`" — make reconciliation a follow-up suggestion rather than a prerequisite.
3. **Skip Step 0 entirely** for capture-problem: capture-problem doesn't write the README, so it can't make drift worse. The cumulative reconciliation cost stays the same regardless of how many captures land before the next review.
4. **Auto-route to `/wr-itil:reconcile-readme`** as a Step 0.5: silently reconcile (it's a one-shot file rewrite, fast and idempotent), then proceed with capture. Loses the user-explicit reconciliation moment but eliminates the halt.

Option 1 is the most surgical — it preserves the fail-fast for genuinely scary drift (orphan rows, missing-file rows) while letting the normal "deferred refresh" pattern flow through. Option 3 is the simplest.

### Investigation Tasks

- [ ] Re-rate Priority and Effort at next /wr-itil:review-problems
- [ ] Confirm the drift signature in `wr-itil-classify-readme-drift` actually distinguishes "deferred capture-problem refresh" from other drift shapes. If the classifier already has the distinction, option 1 is a small change to the classifier exit code mapping; if not, the classifier needs the new shape too.
- [ ] Decide between options 1-4 above. Likely needs a quick ADR amendment to ADR-032 or a new ADR for the Step 0 contract refinement.
- [ ] Reproduction test: two `/wr-itil:capture-problem` invocations in sequence without an interleaved `/wr-itil:review-problems` MUST both succeed. (Behavioural test — exercise the skill's contract, not the SKILL.md text.)

## Dependencies

- **Blocks**: (none — the override path works)
- **Blocked by**: (none)
- **Composes with**: ADR-032 (governance skill invocation patterns — capture-problem is the lightweight-capture variant); P155 (capture-problem driver); P119 (manage-problem create-gate hook, which capture-problem composes with); P149 (the `INLINE_REFRESH` carve-out the current Step 0 distinguishes from `HALT_ROUTE_RECONCILE`).

## Related

- **P039** (`docs/problems/039-decouple-saas-deployment-from-npm-publish.open.md`) — the capture that produced the drift state that blocked P040's capture.
- **P155** — driver for capture-problem itself.
- **ADR-032** — governance skill invocation patterns. The Step 0 contract is implied by ADR-032's "fail-fast on pre-existing committed drift" stance; revisiting it requires either an ADR-032 amendment or a successor ADR.
- **P149** — `INLINE_REFRESH` carve-out for manage-problem's same Step 0; capture-problem currently preserves this carve-out but doesn't have an analogous carve-out for its own deferred-refresh drift shape.
- This ticket is meta — it is a ticket about the skill that captures tickets. Surfaced 2026-05-14 when Step 0 halted P040's capture, forcing the user to issue an override.

(captured via /wr-itil:capture-problem; expand at next investigation)
