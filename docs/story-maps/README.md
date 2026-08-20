# Story Maps

Patton-style backbone × ribs × slices layouts, encoded as HTML because the spatial arrangement is the point.
Each map is a journey-context lens over stories in `docs/stories/`; a map may reference stories from more
than one RFC.

**Adopted 2026-08-20** at the maintainer's direction, working P033. Before that this repository ran no story
tier at all — all nine RFCs carried `stories: []` — and the question of whether to adopt one or record a
deliberate deviation had been left open since P065.

## Lifecycle

`draft/` → `accepted/` → `in-progress/` → `completed/` → `archived/`, by directory.

A map is born `human-oversight: unconfirmed` and is **not** ratified until a human confirms it. Until then it
must not be used to schedule work.

## Maps are generated, not hand-written

A map is one file containing a `<script id="story-map-data" type="application/json">` island. The renderer
rewrites the presentation around that island in place:

```
npm run render:story-maps
```

That runs the renderer from `node_modules/@windyroad/itil`, so it works with no plugin on `$PATH` —
including in CI. The script loops per file deliberately: the renderer takes ONE path, so a bare glob would
render the first map and leave the rest stale without saying so.

**Do not hand-edit the HTML around the island** — the next render discards it. To change a map, edit the
island and re-render. Rendering is idempotent, so a no-op render leaves the file byte-identical.

**Styling lives in `story-map.css`, one shared copy for the whole corpus**, installed beside the maps by the
renderer. Do not add a `<style>` block to a map.

`story-map.css` is **vendored verbatim from `@windyroad/itil`**, pinned to an exact version in
`devDependencies`, and byte-identical to the installed copy. Two things hold that up, and both are checks
rather than intentions:

- `.prettierignore` excludes it so `lint-staged` cannot reformat it. Without that, every commit rewrites it
  and the next upgrade emits a 195-line whitespace diff with any real change — a contrast fix, a focus-ring
  change — invisible inside it.
- `test/js/__tests__/vendored-story-map-assets.test.mjs` compares it byte-for-byte against
  `node_modules/@windyroad/itil/templates/story-map.css`, and asserts the version pin is exact so a range
  cannot introduce a skew that reads like drift. **This sentence used to be prose that nothing could check**
  — there was no installed copy to compare against until the package became a dependency.

Do not edit it here; edit upstream, bump the pin, and re-render.

**A story transition goes stale in four places**, three caught by `story-tier-invariants` and the fourth —
the slice `href`, which embeds the story's state directory — by `doc-links-resolve`. Repairing that fourth
one needs the renderer, which is why it is a dependency rather than only a plugin: CI can now both detect
the staleness and produce the fix. The shared sheet carries the light and dark palettes, the
focus ring, and the contrast tokens; a per-map override would drift from it and would be discarded anyway.

**This replaced a hand-authored map on 2026-08-20, the same day the tier was adopted.** The first version of
this file carried eight hand-written style rules derived from a WCAG review of an inline stylesheet — a
`#767676` border against the template's `#ccc` at 1.61:1, a `#0b3a66` focus ring at `outline-offset: 2px`,
and so on. The shared sheet independently uses the same border grey and the same focus ring, and adds the
dark-mode palette the hand-written version lacked. The rules were right and are now upstream's to keep, so
restating them here would be a second copy that can only drift.

## The history marker on the "already working" row

STORY-MAP-001's first row carries `"preRfc": true`. Upstream says that set is **closed** — the marker is
"a statement about history, not a way to skip allocating an RFC."

**Allowed here on 2026-08-20, by the maintainer, on a narrow ground: this repository's story tier is one day
old, so every row identity in it postdates every piece of work the row describes.** That is the exception's
literal case rather than a stretch of it.

**It is not precedent.** The generous reading it depends on — that "the work is old" licenses the marker even
though _the row was created today_ — is available for any row anyone ever writes, which is exactly why the
set is closed. A second use needs its own argument, and "STORY-MAP-001 did it" is not one.

What it buys: the row renders `delivered`. Without it the five stages that demonstrably work would render
`proposed`, understating what the repo has — the opposite of the inaccuracy the row exists to correct.

## Ratification

A map is born `human-oversight: unconfirmed` and is ratified with
`wr-itil-mark-story-oversight-confirmed <map>`, which writes a fingerprint over the **data island only**. A
re-render that updates presentation therefore does not revoke approval; an edit to the island does.

**Stories carry no oversight marker of their own** (ADR-103). A story is approved because the map it sits on
is approved, via its `story-maps:` field. Writing `human-oversight:` into a story creates a second approval
surface that the framework ignores, so it is inert as well as wrong.

## Schema

Machine-readable trace lives in `<meta name>` tags (`story-map-id`, `status`, `problems`, `rfcs`, `jtbd`,
`adrs`, `reported`, `decision-makers`, `human-oversight`) and in `data-*` attributes on slices
(`data-story-id`, `data-rfc`, `data-jtbd`, `data-status`). Neither is visible to assistive technology, so the
same trace is rendered as a visible `<dl>` in the body.

## Index

| Map           | Status | Title                           | Problems | RFCs    |
| ------------- | ------ | ------------------------------- | -------- | ------- |
| STORY-MAP-001 | draft  | How a change reaches production | P033     | RFC-009 |
