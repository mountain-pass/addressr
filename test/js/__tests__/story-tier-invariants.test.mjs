// @jtbd JTBD-400
//
// WHY THIS EXISTS. JTBD-400 owns these records directly — all six stories carry
// `jtbd: [JTBD-400]`, and the job file carries its own `## Stories` and
// `## Story Maps` tables. That is the hop, and it is testable and rejectable.
// The CLASS is the job statement's anti-erosion clause, but be honest about the
// reach: that clause is literally about test-profile coverage. Applying it to
// governance prose whose facts nothing recomputes is a GENERALISATION
// established by two precedents here (`decisions-invariants`,
// `p033-population-figures-recompute`), not by the clause's own words. A future
// reader should be able to test that hop and reject it.
//
// The story tier landed 2026-08-20 carrying hand-maintained restatements of each
// story's title and status, with nothing recomputing them. THIS LIST IS ITSELF A
// HAND-MAINTAINED ENUMERATION, in the file whose subject is hand-maintained
// enumerations — an earlier revision said "FIVE" and was already wrong by two.
// Treat it as a map, not as a guarantee of completeness:
//
//   docs/stories/README.md          ## Story Rankings   and   ## Done
//   docs/story-maps/README.md       ## Index
//   each map's data island          tasks[].title on the slice cards
//   docs/problems/known-error/033   ## Stories + ## Story Maps
//   JTBD-400 (this job's own file)  ## Stories + ## Story Maps   <- the largest
//   each story's frontmatter        story-id, which IS the filename slug
//
// KNOWN UNCOVERED, named rather than left to be discovered: RFC-009's
// `stories: [STORY-001]` array is a further restatement. This file checks that
// an active story names an RFC; it does NOT check that the RFC names it back.
//
// The last is six titles plus six statuses, the biggest single restatement in
// the corpus. An earlier draft of this file omitted it, which would have
// reproduced the failure P033 documents about itself: "every correction reached
// the site that was named and left its siblings stating the old number." Two
// real drifts were found and fixed the day this landed — P033 carried STORY-001's
// pre-reframe title, and STORY-006 read "before it is called done" in two places
// and "before it is closed" in two others.
//
// THE SINGLE SOURCE OF TRUTH IS THE STORY FILE'S H1. Everything else restates it.
//
// FILENAME SLUGS ARE DELIBERATELY NOT A RESTATEMENT SITE. A slug is a stable
// abbreviated identifier, not a copy of the title: measured 2026-08-20, ZERO of
// six slugs match their H1 verbatim (`decisions-are-written-down-before-the-work`
// against "A change is argued and written down before it is built"). Adding slug
// comparison as an obvious sixth site would red all six stories at once. It also
// means STORY-001's rename that day was cosmetic, not required by this guard.
//
// TABLE SHAPES DIFFER — THREE OF THEM, AND TWO SHARE A FIRST COLUMN NAME:
//
//   | ID    | Title  | Status |            reverse traces (P033, JTBD-400)
//   | Story | Status | Title  | RFC | Map | README ## Story Rankings
//   | Story | Title  | RFC    | Map |     README ## Done — no Status column
//
// So the title column MUST be resolved by header name per table, never by index,
// and the first column name cannot disambiguate the two README tables. A fixed
// index reads column 1 of a Rankings row and gets "draft" as the title — which is
// not hypothetical: two throwaway verification scripts hit exactly that while
// this file was being written.
//
// DIVISION OF LABOUR WITH THE OTHER P033-REACHING TEST, stated because a reader
// seeing two tests named against one ticket will otherwise assume redundancy and
// delete one: `p033-population-figures-recompute` owns P033's population figures
// — the cardinal and every prose restatement of it, recomputed from the ticket's
// own published predicate. `story-tier-invariants` owns P033's `## Stories` and
// `## Story Maps` reverse-trace tables. The two do not overlap, and NEITHER
// WOULD CATCH THE OTHER'S DRIFT.
//
// WHY NOT SHELL OUT TO THE UPSTREAM RECONCILERS. `wr-itil-reconcile-stories` and
// `wr-itil-reconcile-story-maps` do part of this and are non-vacuous — measured
// 2026-08-20: removing a row yields STALE, a phantom row yields DRIFT. Two
// reasons they are not the control:
//
//   1. They are plugin shims on a developer's $PATH and CI installs no plugins.
//      A test shelling to them fails in CI on an absent binary, or skips — and a
//      check that skips is the vacuity this file exists to prevent.
//   2. THEY DO NOT COMPARE TITLES. On 2026-08-20 the map was retitled and the
//      README Index kept the old title; `wr-itil-reconcile-story-maps` exited 0.
//
// This is not a fork: the shims compute a strictly WEAKER fact, in a place CI
// cannot reach. KEEP THEM — they remain the richer local tool for drift kinds
// this file does not model (`STALE_REVERSE_TRACE`, `UNRESOLVED_RFC_TRACE`).
//
// NOT COVERED: whether a story's prose is accurate, and whether an RFC/Map column
// names an artefact that exists — link resolution is `doc-links-resolve`.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../');
const STORIES = path.join(REPO, 'docs/stories');
const MAPS = path.join(REPO, 'docs/story-maps');
const P033 = path.join(REPO, 'docs/problems/known-error/033-source-inspection-tests-anti-pattern.md');
const JTBD400 = path.join(
  REPO,
  'docs/jtbd/addressr-maintainer/JTBD-400-ship-releases-reliably-from-trunk.validated.md',
);

// Lifecycles are the upstream framework's, not local choices. `archived` is
// absent from both deliberately: an archived artefact is hidden from the
// indexes, so its absence from a table is correct rather than drift.
const ACTIVE_STORY_STATES = ['draft', 'accepted', 'in-progress'];
const DONE_STORY_STATES = ['done'];
const MAP_STATES = ['draft', 'accepted', 'in-progress', 'completed'];

const fm = (text, key) => text.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))?.[1]?.trim();
const listOf = (v) => (v ?? '').replace(/[[\]]/g, '').split(',').map((s) => s.trim()).filter(Boolean);
// The reverse-trace generators prefix the ID into the Title cell; the READMEs
// and the island do not. Strip it so a legitimate state cannot red the build.
const bare = (s) => (s ?? '').replace(/^STORY(?:-MAP)?-\d{3}:\s*/, '').trim();

function storiesOnDisk(states) {
  const out = [];
  for (const state of states) {
    const dir = path.join(STORIES, state);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).filter((n) => /^STORY-\d{3}-.*\.md$/.test(n))) {
      const text = readFileSync(path.join(dir, name), 'utf8');
      out.push({
        id: name.match(/^(STORY-\d{3})-/)[1],
        slug: name.replace(/^STORY-\d{3}-/, '').replace(/\.md$/, ''),
        storyId: fm(text, 'story-id'),
        dir: state,
        status: fm(text, 'status'),
        title: bare(text.match(/^#\s+(.+)$/m)?.[1]),
        problems: listOf(fm(text, 'problems')),
        rfcs: listOf(fm(text, 'rfcs')),
        maps: listOf(fm(text, 'story-maps')),
        jtbd: listOf(fm(text, 'jtbd')),
        // Scoped to the Status line, NOT the whole file. Whole-text matching
        // gives the exemption to any story that merely mentions the phrase, and
        // false-reds one that mentions it while legitimately tracing a problem.
        retrospective: /^\*\*Status\*\*:.*retrospective record/im.test(text),
      });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function mapsOnDisk() {
  const out = [];
  for (const state of MAP_STATES) {
    const dir = path.join(MAPS, state);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.html'))) {
      const text = readFileSync(path.join(dir, name), 'utf8');
      const open = text.indexOf('<script id="story-map-data"');
      assert.notEqual(open, -1, `${state}/${name} has no data island — not produced by the renderer`);
      const s = text.indexOf('>', open) + 1;
      const island = JSON.parse(text.slice(s, text.indexOf('</script>', s)).replace(/\\u003c/g, '<'));
      out.push({
        id: island.storyMapId,
        title: bare(island.title),
        status: island.status,
        dir: state,
        h1: bare(text.match(/<h1[^>]*id="story-map-title"[^>]*>([^<]*)<\/h1>/)?.[1]),
        tasks: island.tasks ?? [],
      });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Rows of the pipe table under `heading`, keyed by column HEADER NAME.
 * Name-keyed rather than index-keyed on purpose — see TABLE SHAPES above.
 */
function table(file, heading, idRe) {
  const lines = readFileSync(file, 'utf8').split('\n');
  const start = lines.findIndex((l) => l.trim() === heading);
  assert.notEqual(start, -1, `${path.relative(REPO, file)} has no "${heading}" section`);
  const cells = (l) =>
    l.split('|').map((c) => c.trim()).filter((c, i, a) => !(c === '' && (i === 0 || i === a.length - 1)));
  let header = null;
  const rows = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('## ')) break;
    if (!line.trimStart().startsWith('|')) continue;
    const c = cells(line);
    if (!header) { header = c.map((h) => h.toLowerCase()); continue; }
    if (c.every((x) => /^:?-+:?$/.test(x))) continue; // separator row
    if (!c.some((x) => idRe.test(x))) continue;
    const row = {};
    header.forEach((h, i) => { row[h] = c[i]; });
    rows.push(row);
  }
  assert.ok(header, `${path.relative(REPO, file)} "${heading}" has no table header row`);
  return { header, rows };
}

// Whichever of these the table actually uses. Both README tables open with
// "story", so the FIRST column name cannot disambiguate them.
const idOf = (r) => r.id ?? r.story ?? r.map;
const STORY_ID = /^STORY-\d{3}$/;
const MAP_ID = /^STORY-MAP-\d{3}$/;

describe('story tier restatements agree with the story files', () => {
  it('finds artefacts and rows to check, so a zero-match pass is impossible', () => {
    // Without these floors every assertion below is satisfied by [] === [],
    // which is how a whole tier goes unchecked while CI stays green.
    const active = storiesOnDisk(ACTIVE_STORY_STATES);
    const done = storiesOnDisk(DONE_STORY_STATES);
    const maps = mapsOnDisk();
    assert.ok(active.length > 0, 'no active stories on disk — the tier or the walker has rotted');
    assert.ok(done.length > 0, 'no done stories on disk — the tier or the walker has rotted');
    assert.ok(maps.length > 0, 'no story maps on disk — the tier or the walker has rotted');
    assert.ok(maps.some((m) => m.tasks.length > 0), 'no slice cards on any map — the island walker has rotted');

    // Every story naming a parent must appear in that parent's table, so the
    // floors are the parents' own claim counts rather than a frozen number.
    const everyStory = [...active, ...done];
    const jtbdStories = everyStory.filter((s) => s.jtbd.includes('JTBD-400'));
    const p033Stories = everyStory.filter((s) => s.problems.includes('P033'));
    assert.ok(jtbdStories.length > 0, 'no story claims JTBD-400 — the frontmatter walker has rotted');

    const floors = [
      [table(path.join(STORIES, 'README.md'), '## Story Rankings', STORY_ID).rows.length, 1, 'Story Rankings'],
      [table(path.join(STORIES, 'README.md'), '## Done', STORY_ID).rows.length, 1, 'Done'],
      [table(path.join(MAPS, 'README.md'), '## Index', MAP_ID).rows.length, 1, 'story-map Index'],
      // DERIVED, never a literal. An exact `6` here is exact today and stale the
      // moment STORY-007 lands — after which the largest restatement in the
      // corpus could lose a row and still pass. A hardcoded cardinal inside the
      // guard written to close hardcoded cardinals is the defect in the
      // instrument. Both counts come from disk.
      [table(JTBD400, '## Stories', STORY_ID).rows.length, jtbdStories.length, 'JTBD-400 ## Stories'],
      [table(JTBD400, '## Story Maps', MAP_ID).rows.length, 1, 'JTBD-400 ## Story Maps'],
      [table(P033, '## Stories', STORY_ID).rows.length, p033Stories.length, 'P033 ## Stories'],
      [table(P033, '## Story Maps', MAP_ID).rows.length, 1, 'P033 ## Story Maps'],
    ];
    for (const [got, min, name] of floors) {
      assert.ok(got >= min, `${name} parsed to ${got} rows, expected at least ${min} — the table has rotted`);
    }
  });

  it('a story-id matches its filename slug', () => {
    // DISTINCT from the title rule above. No slug matches its H1 (that is why
    // slugs are not a restatement site), but `story-id` IS the slug — five of
    // six were byte-equal when this landed and the sixth had drifted, left
    // behind by a rename in the very pass that was fixing title drift.
    const wrong = [...storiesOnDisk(ACTIVE_STORY_STATES), ...storiesOnDisk(DONE_STORY_STATES)]
      .filter((s) => s.storyId !== s.slug)
      .map((s) => `${s.id}: story-id "${s.storyId}" but filename slug "${s.slug}"`);
    assert.deepEqual(wrong, [], `story-id drifted from the filename:\n  ${wrong.join('\n  ')}`);
  });

  it('a story frontmatter status matches the directory it sits in', () => {
    const wrong = [...storiesOnDisk(ACTIVE_STORY_STATES), ...storiesOnDisk(DONE_STORY_STATES)]
      .filter((s) => s.status !== s.dir)
      .map((s) => `${s.id}: in ${s.dir}/ but frontmatter says "${s.status}"`);
    assert.deepEqual(wrong, [], `story status disagrees with its directory:\n  ${wrong.join('\n  ')}`);
  });

  it('Story Rankings lists exactly the active stories, with matching status and title', () => {
    const expected = storiesOnDisk(ACTIVE_STORY_STATES).map((s) => `${s.id}|${s.status}|${s.title}`).sort();
    const actual = table(path.join(STORIES, 'README.md'), '## Story Rankings', STORY_ID).rows
      .map((r) => `${idOf(r)}|${r.status}|${bare(r.title)}`).sort();
    assert.deepEqual(actual, expected, 'docs/stories/README.md Story Rankings disagrees with the story files');
  });

  it('the Done table lists exactly the done stories, with matching title', () => {
    // No Status column here — that is the table's shape, not an omission.
    const expected = storiesOnDisk(DONE_STORY_STATES).map((s) => `${s.id}|${s.title}`).sort();
    const actual = table(path.join(STORIES, 'README.md'), '## Done', STORY_ID).rows
      .map((r) => `${idOf(r)}|${bare(r.title)}`).sort();
    assert.deepEqual(actual, expected, 'docs/stories/README.md Done disagrees with the story files');
  });

  it('the story-map Index row matches the map — including its TITLE', () => {
    // The title half is the whole point: the upstream reconciler exited 0 over a
    // stale title on 2026-08-20 because it compares IDs and status only.
    const expected = mapsOnDisk().map((m) => `${m.id}|${m.status}|${m.title}`).sort();
    const actual = table(path.join(MAPS, 'README.md'), '## Index', MAP_ID).rows
      .map((r) => `${idOf(r)}|${r.status}|${bare(r.title)}`).sort();
    assert.deepEqual(actual, expected, 'docs/story-maps/README.md Index disagrees with the map');
  });

  it("a map's rendered heading matches the data island its ratification covers", () => {
    // The oversight fingerprint is scoped to the island, so a hand-edited <h1>
    // would carry an approval it never received.
    const wrong = mapsOnDisk().flatMap((m) => [
      ...(m.h1 !== m.title ? [`${m.id}: <h1> "${m.h1}" vs island "${m.title}"`] : []),
      ...(m.status !== m.dir ? [`${m.id}: island status "${m.status}" but sits in ${m.dir}/`] : []),
    ]);
    assert.deepEqual(wrong, [], `map heading/status drift:\n  ${wrong.join('\n  ')}`);
  });

  it('every slice card names a story that exists, and every story names a map that carries it', () => {
    const all = [...storiesOnDisk(ACTIVE_STORY_STATES), ...storiesOnDisk(DONE_STORY_STATES)];
    const byId = Object.fromEntries(all.map((s) => [s.id, s]));
    const maps = mapsOnDisk();
    const wrong = [];
    for (const m of maps) {
      for (const t of m.tasks) {
        if (!byId[t.storyId]) wrong.push(`${m.id} card "${t.title}" names ${t.storyId}, not on disk`);
        else if (bare(t.title) !== byId[t.storyId].title) {
          wrong.push(`${m.id} card for ${t.storyId}: "${bare(t.title)}" vs story "${byId[t.storyId].title}"`);
        }
      }
    }
    for (const s of all) {
      if (!s.maps.length) { wrong.push(`${s.id} names no story map — its approval derives from one`); continue; }
      for (const id of s.maps) {
        const m = maps.find((x) => x.id === id);
        if (!m) wrong.push(`${s.id} names ${id}, which does not exist`);
        else if (!m.tasks.some((t) => t.storyId === s.id)) {
          wrong.push(`${s.id} names ${id}, which carries no card for it`);
        }
      }
    }
    assert.deepEqual(wrong, [], `story/map trace disagrees:\n  ${wrong.join('\n  ')}`);
  });

  it('the reverse-trace tables on the parent problem and job match the story files', () => {
    const all = [...storiesOnDisk(ACTIVE_STORY_STATES), ...storiesOnDisk(DONE_STORY_STATES)];
    const maps = mapsOnDisk();
    const wrong = [];
    for (const [file, label] of [[JTBD400, 'JTBD-400'], [P033, 'P033']]) {
      for (const r of table(file, '## Stories', STORY_ID).rows) {
        const s = all.find((x) => x.id === idOf(r));
        if (!s) { wrong.push(`${label} ## Stories names ${idOf(r)}, not on disk`); continue; }
        if (bare(r.title) !== s.title) wrong.push(`${label} ${s.id} title "${bare(r.title)}" vs "${s.title}"`);
        if (r.status !== s.status) wrong.push(`${label} ${s.id} status "${r.status}" vs "${s.status}"`);
      }
      for (const r of table(file, '## Story Maps', MAP_ID).rows) {
        const m = maps.find((x) => x.id === idOf(r));
        if (!m) { wrong.push(`${label} ## Story Maps names ${idOf(r)}, not on disk`); continue; }
        if (bare(r.title) !== m.title) wrong.push(`${label} ${m.id} title "${bare(r.title)}" vs "${m.title}"`);
        if (r.status !== m.status) wrong.push(`${label} ${m.id} status "${r.status}" vs "${m.status}"`);
      }
    }
    assert.deepEqual(wrong, [], `reverse-trace drift:\n  ${wrong.join('\n  ')}`);
  });

  it("the README's trace carve-out holds: active stories trace, retrospective records declare that they do not", () => {
    // docs/stories/README.md states the rule for active stories and carves an
    // exception for the retrospective records in prose. That carve-out is itself
    // a hand-maintained fact, so check it rather than trust it — and so a sixth
    // backfilled record cannot slip in looking earned.
    const wrong = [];
    for (const s of storiesOnDisk(ACTIVE_STORY_STATES)) {
      if (!s.problems.length) wrong.push(`${s.id} is active but traces no problem`);
      if (!s.rfcs.length) wrong.push(`${s.id} is active but traces no RFC`);
    }
    for (const s of storiesOnDisk(DONE_STORY_STATES)) {
      if (s.retrospective && (s.problems.length || s.rfcs.length)) {
        wrong.push(`${s.id} is a retrospective record but claims a problem/RFC trace it did not earn`);
      }
      if (!s.retrospective && !s.problems.length) {
        wrong.push(`${s.id} traces no problem and does not declare itself a retrospective record`);
      }
    }
    assert.deepEqual(wrong, [], `the README's trace carve-out is not holding:\n  ${wrong.join('\n  ')}`);
  });
});
