# Stories

INVEST-shaped units of work. Every story sits on a story map and carries acceptance criteria that are
observable — a criterion that cannot fail is not a criterion.

**An active story** — anything in `draft/`, `accepted/` or `in-progress/` — also traces to at least one
problem and at least one RFC. The retrospective records under `## Done` do not, and deliberately so; see the
note there. Stating the rule as universal would make this document contradict its own `## Done` table.

**Adopted 2026-08-20** alongside `docs/story-maps/`. See that README for the adoption context.

## Lifecycle

`draft/` → `accepted/` → `in-progress/` → `done/`, by directory.

A **draft** story is not implementable. It must reach `accepted` first, which is where the INVEST and
RFC-trace gates run and where a human ratifies it.

**A commit implementing a draft story is blocked by a mechanism, not by convention.** The upstream
`itil-no-implement-draft-gate.sh` PreToolUse hook denies any `git commit` carrying a `Refs: STORY-NNN`
trailer whose story is still in `draft/`. Verified 2026-08-20 by firing it three ways: `deny` for a draft
story, silent for a non-draft one, exempt for a `capture STORY-` commit. Naming the mechanism is the point —
per ADR-051 a check whose only reader is the maintainer's attention is not a control, so an unattributed
"blocked by design" would be a claim this README could not back.

## Story Rankings

Active stories — `draft`, `accepted`, `in-progress`. Reconciled against the filesystem by
`wr-itil-reconcile-stories docs/stories`. **No WSJF column**: stories are sequenced by their position in the
parent RFC's `stories:` array, not ranked independently (ADR-060's I11 invariant).

| Story     | Status      | Title                                                                          | RFC     | Map           |
| --------- | ----------- | ------------------------------------------------------------------------------ | ------- | ------------- |
| STORY-001 | in-progress | A test that passes no matter what the code does is found and made able to fail | RFC-009 | STORY-MAP-001 |

## Done

**Retrospective records.** These describe capability that already worked before the story tier existed; the
files were written on 2026-08-20 so STORY-MAP-001 could show those stages of the loop as delivered rather
than blank. None passed through `draft` or `accepted`, and none carries a problem trace — they close no
ticket. They are here because pretending the repo had no working practice before today would be the larger
inaccuracy.

| Story     | Title                                                        | RFC | Map           |
| --------- | ------------------------------------------------------------ | --- | ------------- |
| STORY-002 | A change is argued and written down before it is built       | —   | STORY-MAP-001 |
| STORY-003 | A change is made until its test passes                       | —   | STORY-MAP-001 |
| STORY-004 | A change is reviewed against the rules before it lands       | —   | STORY-MAP-001 |
| STORY-005 | A change reaches production without hand-run steps           | —   | STORY-MAP-001 |
| STORY-006 | A fix is confirmed working in production before it is closed | —   | STORY-MAP-001 |
