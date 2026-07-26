# Problem 064: external-comms commit-message gate leak-scans only the first `-m` value

**Status**: Open
**Reported**: 2026-07-26
**Priority**: 9 (Medium) — Impact: Moderate (3) × Likelihood: Possible (3) — derived at capture from the description per Step 4a. Impact 3 per RISK-POLICY § Confidential Information: a business metric reaching a public repo's commit history is an information-disclosure incident requiring a history rewrite. Likelihood 3: multi-`-m` is a normal and frequent way to write a commit body, so the unscanned surface is exercised routinely rather than exceptionally.
**Origin**: internal
**Effort**: S — derived at capture: the fix is argument-vector iteration inside one hook script, no contract change — cf. P058 (S), the sibling defect in the same gate
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

> **Anchoring note (2026-07-26)**: captured mid-iter with `persona=plugin-developer, jtbd=JTBD-001` supplied by the orchestrator. Those are the **upstream `agent-plugins` home-repo** enum values, not this repo's corpus — this repo's personas are `addressr-maintainer / ai-assistant-user / data-quality-analyst / self-hosted-operator / web-app-developer`, and its `JTBD-001` is "search autocomplete addresses" (web-app-developer), which is unrelated. Re-anchored to `addressr-maintainer` / `JTBD-400` per the P383 adopter-portability rule and the direct precedent on P061, where the user made exactly this correction on 2026-07-24 ("a plugin job ID leaked into this ticket at capture").

## Description

`external-comms-gate.sh` in `@windyroad/risk-scorer` leak-scans the commit message of a `git commit`, but only reads the **first** `-m` value. Git concatenates every `-m` into the final message, separated by blank lines — so on a commit written as `git commit -m "subject" -m "body para 1" -m "body para 2"`, only `subject` is ever seen by the confidential-information scan. Every body paragraph after the first reaches the public commit history unscanned.

This is security-relevant. The gate exists specifically to stop business metrics, credentials, and other confidential content from landing in a public repo, and a commit body is exactly where an agent writes the long-form prose most likely to carry them. The subject line is the one part of a commit message least likely to contain a leak, and it is the only part currently checked.

## Symptoms

- A `git commit` with two or more `-m` arguments passes the external-comms gate on the strength of its subject line alone.
- Confidential content placed in any `-m` after the first is committed without a leak review, with no warning and no audit trace that the scan was partial.
- The failure is silent in both directions: the gate reports PASS, and nothing records that only a fraction of the message was examined.

## Workaround

Write commit messages as a **single** `-m` argument with embedded newlines rather than one `-m` per paragraph. The whole message is then the first (and only) `-m` value, so the gate scans all of it. Every commit in this batch was written that way deliberately.

## Impact Assessment

- **Who is affected**: this repo and every adopter of `@windyroad/risk-scorer` that relies on the external-comms gate to keep confidential content out of a public commit history.
- **Frequency**: whenever a commit is authored with multiple `-m` arguments — a common shape for agents and humans alike.
- **Severity**: Moderate — the harm is a public disclosure needing a history rewrite, but it requires confidential content to be present in the body in the first place, so the gate gap is a missing control rather than an active leak.
- **Analytics**: N/A

## Root Cause Analysis

### Preliminary Hypothesis

`external-comms-gate.sh` parses the tool-call arguments for a `git commit` and extracts the message by matching the first `-m` (or `--message`) occurrence, then stops. Git's own semantics are cumulative: every `-m` becomes a paragraph of one message. The hook's single-value extraction and git's multi-value concatenation disagree, and the hook's reading is the narrower one.

Sibling defect, same gate, different root cause: **P058** — the gate's surface regex keys on the `git commit` literal, so `wr-risk-scorer-restage-commit`-wrapped commits skip commit-message review entirely (upstream `windyroad/agent-plugins#368`). P058 is about _which invocations_ reach the gate; this ticket is about _how much of the message_ the gate reads once it is reached. Fixing either one leaves the other open.

### Investigation Tasks

- [ ] Confirm the single-`-m` extraction against the installed `external-comms-gate.sh` source and record the file:line
- [ ] Create a reproduction: a two-`-m` commit whose second `-m` carries a planted sentinel the gate should reject, and confirm it passes
- [ ] Report upstream against `windyroad/agent-plugins` (`@windyroad/risk-scorer`), cross-referencing #368 so a fix for one does not regress the other
- [ ] Re-verify against the next `@windyroad/risk-scorer` release carrying a fix, then transition

## Dependencies

- **Blocks**: (none)
- **Blocked by**: upstream — the gate script lives in `@windyroad/risk-scorer`; there is no local `packages/` tree to fix it in
- **Composes with**: P058 (same gate, complementary coverage gap)

## Related

- **P058** (`docs/problems/parked/058-restage-commit-helper-bypasses-external-comms-commit-message-gate.md`) — sibling gap in the same gate; upstream `windyroad/agent-plugins#368`. Captured separately rather than hung off P058 because the root causes are independent: surface-regex coverage vs message-value extraction.
- **P048** (`docs/problems/parked/048-external-comms-marker-hash-exactness-forces-re-review-round-trips.md`) — third defect in the same external-comms machinery; upstream `windyroad/agent-plugins#361`.
- **P016** (`docs/problems/parked/016-external-comms-missing-voice-tone-and-risk-checks.md`) — the original external-comms process gap this gate was built to close.
- `RISK-POLICY.md` § Confidential Information — the impact basis for the Moderate rating.
- Memory `feedback_no_confidential_metrics.md` — the standing rule the gate mechanises.
- Captured via `/wr-itil:work-problems` iter, 2026-07-26 (manual capture-problem steps; Skill tool erroring this session).
