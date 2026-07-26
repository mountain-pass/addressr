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

### Confirmed Root Cause (2026-07-26, read from source)

Confirmed against `~/.claude/plugins/cache/windyroad/wr-risk-scorer/0.18.6/hooks/external-comms-gate.sh`. The extraction runs in a `python3` heredoc embedded in the shell script, so these are file line numbers:

- **Line 243** — the pattern list is annotated `# (pattern, flags, unescape) — first match wins.`
- **Lines 260-261** — the single-line commit-message patterns: `(?:-m|--message)[= ]'([^']*)'` and `(?:-m|--message)[= ]"([^"]*)"`.
- **Lines 263-270** — the extraction loop: `for pat, flags, unescape in patterns:` / `m = re.search(pat, cmd, flags)` / `if m: ... print(body); break`.

`re.search` returns the **first** match only, and the `break` exits after the first matching pattern. Neither the loop nor the patterns account for a command carrying more than one `-m`. Git's semantics are cumulative — every `-m` becomes a paragraph of one message — so the hook's single-value extraction and git's multi-value concatenation disagree, and the hook's reading is the narrower one.

The single-`-m` HEREDOC form is **unaffected**: the HEREDOC pattern sits first in the list and captures the whole body. Only the multi-`-m` form loses coverage. This is also why the workaround works.

Candidate fix: `re.findall` over the two commit-message patterns, joined with the blank-line separator git itself inserts. The `break`-on-first-_pattern-family_ behaviour is correct for choosing between the HEREDOC, `--body`, and `-m` families — the change is to keep first-family-wins while making the `-m` family collect all its occurrences.

Sibling defect, same gate, different root cause: **P058** — the gate's surface regex keys on the `git commit` literal, so `wr-risk-scorer-restage-commit`-wrapped commits skip commit-message review entirely (upstream `windyroad/agent-plugins#368`). P058 is about _which invocations_ reach the gate; this ticket is about _how much of the message_ the gate reads once it is reached. Fixing either one leaves the other open.

### Investigation Tasks

- [x] Confirm the single-`-m` extraction against the installed `external-comms-gate.sh` source and record the file:line — **done 2026-07-26**, v0.18.6 lines 243 / 260-261 / 263-270; see Confirmed Root Cause above
- [ ] Create a reproduction: a two-`-m` commit whose second `-m` carries a planted sentinel the gate should reject, and confirm it passes
- [x] Report upstream against `windyroad/agent-plugins` (`@windyroad/risk-scorer`), cross-referencing #368 so a fix for one does not regress the other — **done 2026-07-26**, filed as [windyroad/agent-plugins#395](https://github.com/windyroad/agent-plugins/issues/395); see `## Reported Upstream`
- [ ] Re-verify against the next `@windyroad/risk-scorer` release carrying a fix, then transition

## Dependencies

- **Blocks**: (none)
- **Blocked by**: upstream — the gate script lives in `@windyroad/risk-scorer`; there is no local `packages/` tree to fix it in
- **Composes with**: P058 (same gate, complementary coverage gap)

## Reported Upstream

- **URL**: https://github.com/windyroad/agent-plugins/issues/395
- **Reported**: 2026-07-26
- **Template used**: problem-report.yml (problem-first shape, body composed per ADR-033 structured mapping)
- **Disclosure path**: public issue. The vendor's own tracker is the right channel and no local policy class covers pre-disclosure of a third-party defect; the leak reviewer noted that a private security-advisory path, if `windyroad/agent-plugins` publishes one, would be the lower-exposure surface for the same text.
- **Dedup verdict**: `different-problem` against #368 (same gate, false-negative on **surface detection** — helper-wrapped commits never reach the gate at all; this one is how much of the message is read once an invocation _is_ seen), and against #361 / #217 (both false-**positive** marker-hash re-review friction, not scan coverage; #217 mentions `-m` vs HEREDOC only as a source of hash churn). All three cross-referenced in the filed body, with a co-triage suggestion for #368 since both are false-negative coverage gaps in the same gate.
- **Gates**: `wr-risk-scorer:external-comms` PASS; `wr-voice-tone:external-comms` PASS. Both took one re-run: the first pass failed closed on draft-access (path passed instead of an inlined `<draft>` block), and after the re-review the drafts' markers were invalidated by a late edit adding the exact source line numbers — the P048 / #217 hash-exactness friction, observed live. `gh issue create --body-file` was also rejected by the gate (the extractor cannot see a file's contents); the HEREDOC `--body "$(cat <<'EOF' ... EOF)"` form is what the gate parses.
- **Cross-reference confirmed**: yes — the issue body's Cross-reference section names P064 and links this ticket's path in this repo's `docs/problems/` directory.
- **Local status unchanged**: remains Open and upstream-blocked. Reporting does not fix it locally, and there is no local `packages/` tree to fix it in. Held at Open rather than folded to Known Error, matching the P058 upstream-blocked precedent.

## Related

- **P058** (`docs/problems/parked/058-restage-commit-helper-bypasses-external-comms-commit-message-gate.md`) — sibling gap in the same gate; upstream `windyroad/agent-plugins#368`. Captured separately rather than hung off P058 because the root causes are independent: surface-regex coverage vs message-value extraction.
- **P048** (`docs/problems/parked/048-external-comms-marker-hash-exactness-forces-re-review-round-trips.md`) — third defect in the same external-comms machinery; upstream `windyroad/agent-plugins#361`.
- **P016** (`docs/problems/parked/016-external-comms-missing-voice-tone-and-risk-checks.md`) — the original external-comms process gap this gate was built to close.
- `RISK-POLICY.md` § Confidential Information — the impact basis for the Moderate rating.
- Memory `feedback_no_confidential_metrics.md` — the standing rule the gate mechanises.
- Captured via `/wr-itil:work-problems` iter, 2026-07-26 (manual capture-problem steps; Skill tool erroring this session).
