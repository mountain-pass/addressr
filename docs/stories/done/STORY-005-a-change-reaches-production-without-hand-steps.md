---
status: done
story-id: a-change-reaches-production-without-hand-steps
reported: 2026-08-20
decision-makers: [Tom Howard]
problems: []
rfcs: []
jtbd: [JTBD-400]
story-maps: [STORY-MAP-001]
estimated-effort: S
---

# STORY-005: A change reaches production without hand-run steps

**Status**: done — **retrospective record**, written 2026-08-20 so the map can show this stage as working.
It did not pass through draft or accepted.

## User value

In order to release without remembering a sequence of manual steps, as the maintainer, I want a push to trunk
to carry the change to production on its own.

## What is already in place

Trunk-based delivery on `master` with one pipeline path to production, a release PR that plans the
infrastructure change before the merge, and a guard that refuses a push changing infrastructure with nothing
armed to apply it.

## Related

- **STORY-MAP-001** — the stage this sits under is "release it".
