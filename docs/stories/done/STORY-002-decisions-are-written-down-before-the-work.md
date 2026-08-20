---
status: done
story-id: decisions-are-written-down-before-the-work
reported: 2026-08-20
decision-makers: [Tom Howard]
problems: []
rfcs: []
jtbd: [JTBD-400]
story-maps: [STORY-MAP-001]
estimated-effort: S
---

# STORY-002: A change is argued and written down before it is built

**Status**: done — **retrospective record.** This capability shipped long before the story tier existed; the
file was written on 2026-08-20 so the map can show the stage as working rather than blank. It did not pass
through draft or accepted, and it should not be read as though it did.

## User value

In order to know why the code is the way it is a year from now, as the maintainer, I want each change argued
and recorded before it is built.

## What is already in place

Problem tickets in `docs/problems/`, decision records in `docs/decisions/`, and RFCs in `docs/rfcs/`, with a
documented lifecycle for each. Decisions carry a ratification marker, so one made without a human is
distinguishable from one a human approved.

## Related

- **STORY-MAP-001** — the stage this sits under is "decide what to change".
