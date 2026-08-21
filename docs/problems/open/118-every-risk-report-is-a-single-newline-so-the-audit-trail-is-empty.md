# Problem 118: Every risk report is a single newline, so the risk audit trail has been empty since 2026-08-19

**Status**: Open
**Reported**: 2026-08-21
**Priority**: 10 (High) — Impact: Minor (2) × Likelihood: Almost certain (5). Impact 2: governance and audit quality only — no consumer, runtime or deploy path is touched, which is the RISK-POLICY Impact-2 clause read straight. It is not 1 because the corpus is the institutional memory a risk assessment reconciles against, and its loss is silent. Likelihood 5, not an estimate: it fires on every assessment, measured over the whole surviving corpus rather than sampled.
**Origin**: internal
**Effort**: S — one line in an upstream hook. The addressr-side action is to report it; the fix is not ours to land.
**WSJF**: 10.0 — (10 × 1.0) / 1
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

Every file in `.risk-reports/` is a single newline. Measured 2026-08-21: **98 of 109 are 1 byte**, and
every one written since **2026-08-19T00-59-26** is, including the report for `9af15ef4` written six minutes
before this ticket.

The writer is one line in `wr-risk-scorer`'s `hooks/risk-score-mark.sh`:

```sh
REPORT_PATH="${REPORT_DIR}/${TIMESTAMP}-commit.md"
echo "$AGENT_OUTPUT" > "$REPORT_PATH"
```

`echo` of an empty variable emits exactly one byte. So a 1-byte report is not a truncation or a race — it is
the arithmetic of an empty `AGENT_OUTPUT`, and it is indistinguishable on disk from a report that was
written and happened to be empty.

**`AGENT_OUTPUT` is empty because the scorer runs as a BACKGROUND subagent.** The `PostToolUse:Agent` hook
fires when the Agent tool call returns, and for a background launch it returns launch metadata, not the
verdict — the verdict arrives later, out of band. This is the same root cause the external-comms gate names
as P402 in its own deny message.

**Nothing surfaces it.** `.risk-reports/` is gitignored, so the decay leaves no diff, no CI signal and no
review surface. `hooks/risk-score.sh` prunes the directory at `-mtime +7`, so the evidence of when it broke
is itself on a seven-day timer — the 2026-08-17 boundary visible today will be gone by 2026-08-24.

## Symptoms

1. A risk assessment cannot re-read its own prior report. Observed this session: the pipeline scorer was
   asked to ground a `RISK_BYPASS: reducing` claim on a finding from its own earlier report and could not,
   recording instead that every report in the range was empty and that the claim rested on the diff alone.
2. The surviving non-empty reports come in **adjacent pairs** one second apart (`04-09-38`/`04-09-39`,
   `05-19-28`/`05-19-29`, `00-48-54`/`00-48-55`, `00-59-25`/`00-59-26`), which is the shape of two writes
   per scoring event rather than one. Whatever produced the second, populated write stopped after
   2026-08-19.
3. Empty and populated files INTERLEAVE before that date, so this reads at a glance like flakiness rather
   than a clean break. It is not flaky now: everything after the boundary is empty, without exception.

## Workaround

None that restores the corpus. The verdict itself is not lost while a session is live — it is in the
transcript, and the score markers still land, so the gates still function and commits still proceed. What is
lost is the durable record after the session ends.

Partial mitigation: paste a scorer verdict into the ticket or commit message that depends on it, rather than
citing the report path. This session's two commits do that.

## Impact Assessment

- **Who is affected**: the maintainer, and every future risk assessment that would reconcile against a
  lifetime baseline. No consumer, runtime, deploy or npm path.
- **Frequency**: every assessment, since 2026-08-19.
- **Severity**: Minor, and slow. Nothing breaks today; the cost is that the reasoning behind past scoring
  decisions is unavailable to future ones.
- **Analytics**: N/A.

## Root Cause Analysis

**Root cause: a PostToolUse hook reads the verdict from the tool result, and a backgrounded subagent's tool
result does not contain the verdict.** The hook is correct for a synchronous dispatch and silently degrades
for an asynchronous one, because `echo "$AGENT_OUTPUT"` has no failure mode — it writes a file either way.

**Why nothing caught it**: the artefact is gitignored, so no test, no guard and no diff observes it; and the
degraded output is a valid file at a valid path with a valid name. A check for "was a report written" passes.
Only a check on its CONTENT would fail — which is this repo's own P033 thesis arriving in the risk tooling:
the mechanism is present, runs, produces output, and establishes nothing.

### Investigation Tasks

- [ ] Confirm whether the write is reached at all on the current path, or whether the surviving 2026-08-17
      to 2026-08-19 pairs came from a second, now-absent writer. The adjacent-pair shape is unexplained and
      the two hypotheses have different fixes.
- [ ] Report upstream to `@windyroad/agent-plugins` alongside P402. The minimal ask is that the hook not
      write a report at all when `AGENT_OUTPUT` is empty — an absent file is honest, a 1-byte file is not.
- [ ] Decide whether addressr should assert on this locally. A guard that reads the newest `.risk-reports`
      entry and fails on a 1-byte body would have caught this on day one, and is the anti-vacuity floor
      shape P033 already argues for.
- [ ] Capture the boundary evidence before `-mtime +7` prunes it. The 2026-08-17/2026-08-19 interleave is
      the only signal about when and how this started and it expires 2026-08-24.

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: P083, P080

## Related

- **[P083](083-risk-register-is-an-index-of-hints-not-a-register-24-of-25-entries-uncurated.md)** — the
  risk REGISTER (`docs/risks/`) is 24-of-25 uncurated. Different artefact, and the two compose in one
  direction: P083 records that the register was scaffolded from `RISK_REGISTER_HINT` lines emitted by the
  pipeline scorer. Those hints are parsed from the same `AGENT_OUTPUT` this ticket finds empty, so the
  register's supply has been cut off by the same defect. P083 is about the quality of what is there; this is
  about nothing new arriving.
- **[P080](080-external-comms-gate-cannot-read-body-file-so-the-documented-path-never-clears.md)** — the
  external-comms gate's draft EXTRACTION produces a key that cannot match. Sibling, not duplicate: P080 is a
  key-derivation fault at PreToolUse; this is a body-persistence fault at PostToolUse. They were hit in the
  same session and their symptoms are easy to confuse, which is P080's own recorded complaint.
- **[P107](107-a-verification-vouches-only-for-the-state-it-ran-against.md)** — shares the `.risk-reports`
  and P402 signals.
- **P402** (upstream, `@windyroad/agent-plugins`) — background-dispatched subagents do not fire their
  PostToolUse mark hook. Named by the external-comms gate's own deny text. Same root cause.
- **P033** — source-inspection tests. Cited for its thesis, not its scope: a mechanism that runs and
  produces output can still establish nothing, and only a check on content can tell.

**Hang-off pre-filter, recorded per the capture contract**: seven candidates shared a signal —
P079, P080, P082, P083, P086, P087, P107 — which is above the five-candidate cap, so the arbiter dispatch
was skipped by rule. P083 and P107 were read directly before filing; both are distinct, and the P083
relationship is recorded above rather than left for a reviewer to rediscover.
