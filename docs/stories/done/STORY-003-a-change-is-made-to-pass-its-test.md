---
status: done
story-id: a-change-is-made-to-pass-its-test
reported: 2026-08-20
decision-makers: [Tom Howard]
problems: []
rfcs: []
jtbd: [JTBD-400]
story-maps: [STORY-MAP-001]
estimated-effort: S
---

# STORY-003: A change is made until its test passes

**Status**: done — **retrospective record**, written 2026-08-20 so the map can show this stage as working.
It did not pass through draft or accepted.

## User value

In order to ship a change that does what it claims, as the maintainer, I want the work to continue until its
test passes.

## What is already in place

The behavioural suites under `test/js/__tests__/` run the code and fail when it breaks. This stage is not the
broken one — the defect P033 records is upstream of it, in tests that never could fail.

## Related

- **STORY-MAP-001** — the stage this sits under is "make it pass".
