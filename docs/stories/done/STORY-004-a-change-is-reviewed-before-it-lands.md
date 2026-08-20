---
status: done
story-id: a-change-is-reviewed-before-it-lands
reported: 2026-08-20
decision-makers: [Tom Howard]
problems: []
rfcs: []
jtbd: [JTBD-400]
story-maps: [STORY-MAP-001]
estimated-effort: S
---

# STORY-004: A change is reviewed against the rules before it lands

**Status**: done — **retrospective record**, written 2026-08-20 so the map can show this stage as working.
It did not pass through draft or accepted.

## User value

In order to catch a bad change before it reaches trunk rather than after, as the maintainer working without a
second reviewer, I want every change checked against the recorded rules automatically.

## What is already in place

Review gates that block rather than advise: architecture, jobs-to-be-done, accessibility, voice, and a risk
score that refuses a commit above appetite. They run as hooks at the moment of the edit or the commit, so
they do not depend on anyone remembering to ask.

## Related

- **STORY-MAP-001** — the stage this sits under is "get it past the gates".
