---
status: done
story-id: a-fix-is-confirmed-in-production-before-it-is-closed
reported: 2026-08-20
decision-makers: [Tom Howard]
problems: []
rfcs: []
jtbd: [JTBD-400]
story-maps: [STORY-MAP-001]
estimated-effort: S
---

# STORY-006: A fix is confirmed working in production before it is closed

**Status**: done — **retrospective record**, written 2026-08-20 so the map can show this stage as working.
It did not pass through draft or accepted.

## User value

In order to avoid closing a ticket on a fix that never worked, as the maintainer, I want a fix confirmed in
production before it counts as done.

## What is already in place

A ticket does not close when the fix is committed. It moves to a verification state and closes only once the
fix is confirmed working, which keeps "shipped" and "fixed" as separate claims.

## Related

- **STORY-MAP-001** — the stage this sits under is "confirm it works in production".
