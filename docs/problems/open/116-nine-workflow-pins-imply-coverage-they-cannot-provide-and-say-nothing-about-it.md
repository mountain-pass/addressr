# Problem 116: Nine workflow pins imply coverage they cannot provide, and say nothing about it

**Status**: Open
**Reported**: 2026-08-20
**Priority**: 12 (High) — Impact: 3 × Likelihood: 4. Impact 3 rather than 4: the harm is misplaced confidence on the release path — a reader treats a YAML string match as evidence the step runs — which degrades a decision rather than shipping a defect directly; the four-month P091 defect that carries P033's Impact 4 came from a source pin, not a workflow pin. Likelihood 4: the pins exist, are read during release work, and the misreading is the documented default — the file path and `describe()` titles imply behavioural coverage, which is P033's failure mode 4.
**Origin**: internal
**Effort**: S — a comment per file, nine files. No code changes, no conversions, no new instruments.
**WSJF**: 12.0 — (12 × 1.0) / 1
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

**Split out of P033 on 2026-08-20 so an S task is not buried by an XL divisor.** P033 transitioned to Known
Error the same day with its effort re-rated M → XL, correctly: converting the non-workflow population is 22
files of behavioural test authoring, which is multi-day. But P033 held two open tasks with an 8× effort
spread, and rating the ticket XL sank the cheap one with the expensive one — moving it from roughly rank 11
to rank 34 of 50. This is the same grain-mismatch argument P033 used to reject a file-level ratchet for an
assertion-level defect, turned on its own effort rating.

**The work itself**: nine test files pin `.github/workflows/**` YAML by text. For those pins, extraction and
behavioural conversion is not available — nothing in this repository runs a workflow, so there is no runtime
to feed. P033 states it plainly: for these files the note is **"the ONLY remedy available"**, and calls the
task **"the larger half by count and it is not a lesser task"**.

A workflow pin can prove a string is present in YAML and nothing else. **Not** that the step runs. **Not**
that the job is reached. **Not** what GitHub does with it. Saying that in the file is the difference between
a known limit and a false sense of coverage.

The nine files, derived from P033's published predicate rather than hand-listed:

`deploy-guard-surfaces`, `docker-image-workflow`, `gnaf-source-smoke`, `license-audit-runs-in-ci`,
`loader-workflow`, `release-pr-plan-workflow`, `release-workflow-deploy-only`, `terraform-plan-workflow`,
`workflow-npm-scripts-resolve` — all `.test.mjs` under `test/js/__tests__/`.

## Symptoms

1. A reader treats a green workflow test as evidence the workflow step executes. It is evidence a string is
   present in a YAML file.
2. The file path (`test/js/__tests__/`) and the `describe()` titles imply behavioural coverage — P033's
   failure mode 4, the reviewer trap.
3. Three of the nine sit on the release path (`release-workflow-deploy-only`, `release-pr-plan-workflow`,
   `deploy-guard-surfaces`), where a pin that cannot fail passes a defect into a published artefact.

## Workaround

Read the pin before trusting it. That is operator memory and is not a control — which is the whole reason
the note belongs in the file rather than in a reader's head.

## Impact Assessment

- **Who is affected**: the maintainer during release work, and any agent reading these files to decide
  whether a change is covered.
- **Frequency**: continuous; every read of a workflow test.
- **Severity**: Moderate. No defect ships from the note being absent; a wrong decision about whether
  something is tested is what ships.

## Root Cause Analysis

The pins were written when the convention was to assert over file text, and the limit was understood by the
author but never written down. P033's settled rule (2026-08-20) now says a text assertion over SOURCE is
illegitimate regardless of what it pins — but these are the **declarative-artefact carve-out**: workflow YAML
is consumed by GitHub, so the artefact IS the subject and reading it is not a proxy for behaviour. They are
legitimately unconvertible, which is exactly why the note is the only remedy.

### Investigation Tasks

- [ ] Add a header note to each of the nine files stating what its pins cannot establish — that a string is
      present in YAML, and nothing about whether the step runs, the job is reached, or what GitHub does.
- [ ] State the note in the file, not in a ticket. A limit recorded only here is one the reader never meets.
- [ ] Do NOT claim the note is a control (ADR-051). It converts an unknown limit into a known one; it
      enforces nothing.
- [ ] Consider whether the three release-path files warrant a stronger form — the `scripts/scan-jobs.awk`
      extraction on 2026-08-19 showed a shell predicate CAN be extracted and fixture-tested, so "no runtime
      to feed" is true of the YAML and not always of the shell the YAML invokes.

## Fix Strategy

**Kind**: `improve`. **Shape**: documentation-in-code — a header comment per file.

Nine files, one comment each, no behaviour change and no new instrument. The acceptance test is that a reader
opening any of the nine learns, without leaving the file, that a green result means a string was found.

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none) — deliberately. This is split from P033 precisely so it does not inherit P033's XL
  transitive effort. The two tasks share a subject, not a dependency: the notes can land whether or not the
  22-file conversion ever starts.
- **Composes with**: P033

## Related

- **[P033](../known-error/033-source-inspection-tests-anti-pattern.md)** — parent. Carries the settled rule,
  the published predicate that derives the nine-file list, the audit that sized both halves, and the
  mechanically demonstrated BLIND verdict. This ticket is its Investigation Task 2, split out at the risk
  scorer's recommendation on 2026-08-20 because an S task ranked at an XL divisor is a task that does not get
  done.
- **ADR-051** (a check whose only reader is the maintainer is not a control) — why the note must not be
  recorded as a control.
- **[P098](098-five-test-files-reached-by-no-runner-assertions-never-execute.md)** — adjacent: tests that
  never execute at all. This ticket is about tests that execute and establish less than they appear to.
