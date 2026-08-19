// P033 publishes a predicate for its population, then states figures derived
// from it. This recomputes the predicate and fails if the ticket disagrees.
//
// WHY THIS EXISTS. The figures in that ticket were wrong four times in one
// session, each time in a way that read as precise: two scripts measuring two
// populations under one headline; a "bound" that over- and under-counted at
// once; a rule whose answer moved between two runs minutes apart; and a
// classifier that missed a file because it matched the literal string
// '.github/workflows' while the file built the path with path.join. Every
// correction reached the site that was named and left its siblings stating the
// old number — four of them, in the ticket whose own rule is that the unit of
// a correction is the claim, not the locality.
//
// A count asserted in prose has nothing that recomputes it. This is that.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Spelled cardinals appear in the ticket's prose, so they are read back and
// required to agree rather than denylisted one at a time.
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen'];

// The ticket wraps at 110 columns, so a cardinal and its noun routinely sit on
// different lines. Every phrase check below runs against this, not the raw text.
const wordOf = (n) => WORDS[n];
const cap = (w) => w[0].toUpperCase() + w.slice(1);
const inBoth = (a, b) => a.filter((f) => b.includes(f)).length;

const testsDir = fileURLToPath(new URL('.', import.meta.url));
// Lifecycle-agnostic. The path was hardcoded to `open/`, so this guard would
// have thrown ENOENT and reddened the whole suite the moment the ticket it
// measures transitioned to verifying/ or closed/ — the R018 mutable-segment
// class, in executable code, where doc-links-resolve does not scan.
const ticketPath = (() => {
  const problems = fileURLToPath(new URL('../../../docs/problems/', import.meta.url));
  const found = [];
  // States are DERIVED, not listed. The list was ['open','verifying',
  // 'known-error','closed'] under a header saying "lifecycle-agnostic" — and
  // `docs/problems/parked/` exists with sixteen tickets in it. Parking P033
  // would have found nothing and reddened the suite on a legitimate
  // transition. A name wider than its configured value, in the guard that
  // exists to catch names wider than their configured values.
  const states = readdirSync(problems, { withFileTypes: true });
  for (const entry of states) {
    if (!entry.isDirectory()) continue;
    const stateDir = path.join(problems, entry.name);
    const entries = readdirSync(stateDir);
    for (const f of entries) {
      if (f.startsWith('033-')) found.push(path.join(stateDir, f));
    }
  }
  // Exactly one, so a duplicate left behind by a half-finished move is loud
  // rather than silently picking whichever the directory listed first.
  assert.equal(found.length, 1, `expected exactly one 033-* ticket, found ${found.length}`);
  return found[0];
})();

// The predicate exactly as the ticket publishes it. If this and the ticket's
// prose ever diverge, that is the defect — change both together.
function classify({ excludeSelf = true } = {}) {
  const workflow = [];
  const other = [];
  const exercises = [];
  const readsOnly = [];
  // This file is excluded from its own population. It reads test files and
  // asserts, and it quotes '.github/workflows' while explaining the predicate,
  // so it classifies itself into the group it measures and shifts every figure
  // by one. The observer belongs outside the sample; naming the exclusion here
  // is what keeps that from being a silent thumb on the scale.
  const SELF = 'p033-population-figures-recompute.test.mjs';
  for (const file of readdirSync(testsDir)) {
    if (!file.endsWith('.test.mjs')) continue;
    if (excludeSelf && file === SELF) continue;
    const source = readFileSync(path.join(testsDir, file), 'utf8');
    if (!/readFileSync|readFile\(|readdirSync/.test(source)) continue;
    if (!source.includes('assert.')) continue;
    (source.includes('.github') && source.includes('workflows') ? workflow : other).push(file);
    // Second axis, added 2026-08-19 with the per-file audit: does the file
    // EXERCISE its subject, or only read it? Dynamic `await import(...)` is
    // matched as well as static `from '...'` — the audit's first classifier
    // missed proxy-auth.test.mjs on exactly that, so the pattern that missed it
    // is not the pattern pinned here.
    (/(?:from|import\()\s*['"][^'"]*(?:packages|scripts|test\/k6)\//.test(source) ||
    /spawnSync|execFileSync|execSync|spawn\(/.test(source)
      ? exercises
      : readsOnly
    ).push(file);
  }

  return { workflow, other, exercises, readsOnly };
}

describe('P033 population figures recompute from the ticket’s own predicate', () => {
  const ticket = readFileSync(ticketPath, 'utf8');
  const { workflow, other, exercises, readsOnly } = classify();

  it('finds a population at all', () => {
    // An empty corpus would make every assertion below vacuously true — the
    // failure mode this ticket is named after, arriving through its own guard.
    assert.ok(workflow.length > 0, 'no workflow-reading test files found');
    assert.ok(other.length > 0, 'no other file-reading test files found');
  });

  it('states the same three cardinals the predicate produces, each in its own row', () => {
    // Anchored to the row label, not to "any cell anywhere in the document".
    // An unanchored value assertion is the defect this ticket records at its
    // `type: boolean` entry — a match against any input in the file carrying
    // that property, latent rather than live. It would also pass if the two
    // rows were swapped, or if a future value collided with a cell in the
    // Remaining population table, which already carries 0, 2 and 5.
    for (const [rowLabel, value] of [
      // Anchors must be distinctive, not merely present: 'files that read' is
      // a substring of the total row's label and silently matched it.
      ['test files that read a repo file and assert', workflow.length + other.length],
      ['of those, files that read', workflow.length],
      ['all other file-reading test files', other.length],
    ]) {
      const row = ticket
        .split('\n')
        .find((line) => line.startsWith('|') && line.includes(rowLabel));
      assert.ok(row, `no table row found for "${rowLabel}"`);
      assert.match(
        row,
        new RegExp(String.raw`\|\s*${value}\s*\|`),
        `the "${rowLabel}" row should carry ${value}; row reads: ${row}`,
      );
    }
  });

  it('names every workflow-reading file (under-listing only — see the note)', () => {
    // TITLE SCOPE, stated because a title that reads as covered suppresses the
    // check that would cover it — this ticket's failure mode 4. This asserts
    // ONE direction: every computed file is named. It does NOT catch a
    // spurious name, or a name left behind after a file is renamed or deleted.
    // Under-listing is the direction that has actually fired here twice (nine
    // for ten, and the omitted license-audit-runs-in-ci); over-listing is
    // falsifiable by one `ls`. The substring form below also means a listed
    // name that is a prefix of a computed name satisfies it; no such collision
    // exists among the current ten.
    // The list is the checkable form of the claim, so it is checked. A file
    // added to the workflow group without being named here is exactly the miss
    // that produced "nine" when the answer was ten.
    // Scoped to the list paragraph alone. A fixed-width window overlapped the
    // NEXT paragraph, which names license-audit-runs-in-ci while explaining
    // why the first version of the list omitted it — so deleting the name from
    // the list itself went unnoticed. The window was the guard's blind spot.
    // The anchor is DERIVED, not literal. It was `'The ten are'` — so the one
    // cardinal this guard touches most was the one it verified least: extend
    // the list to eleven names and the under-listing loop below still passes,
    // green over a ticket reading "The ten are". Deriving it makes the anchor
    // track the population and turns the cardinal into an assertion at once.
    const anchor = `The ${WORDS[workflow.length]} are`;
    const start = ticket.indexOf(anchor);
    assert.notEqual(
      start,
      -1,
      `the ticket must introduce the named list as "${anchor}" — if the list is present but ` +
        `differently worded, the cardinal in that sentence is stale`,
    );
    const end = ticket.indexOf('\n\n', start);
    // Unguarded, a -1 here makes slice() return the whole remainder of the
    // document minus one character — the wide window restored, silently. The
    // fix for a fragile window must not depend on an unchecked sentinel.
    assert.notEqual(end, -1, 'the named list must be followed by a paragraph break');
    const named = ticket.slice(start, end);
    for (const file of workflow) {
      assert.ok(
        named.includes(file.replace('.test.mjs', '')),
        `${file} reads workflow YAML but the ticket does not name it`,
      );
    }
  });

  it('states the WITHOUT-exclusion triple the published predicate would return', () => {
    // The ticket explains the self-exclusion by saying what the rule returns
    // without it. That sentence is a live claim about a computation, so it is
    // computed — it was stale within one commit of being written, and neither
    // the cardinal assertions nor the denylist could see it.
    const bare = classify({ excludeSelf: false });
    const triple = `${bare.workflow.length + bare.other.length} / ${bare.workflow.length} / ${bare.other.length}`;
    assert.ok(
      ticket.includes(`run without the exclusion the rule returns ${triple}`),
      `the ticket should say the un-excluded rule returns ${triple}`,
    );
  });

  it('states the right group size in the over-counting note', () => {
    // Same shape, same reason: a bare cardinal in prose, one restatement away
    // from the table, with nothing recomputing it.
    assert.ok(
      ticket.includes(`is among the ${other.length} and holds no source pin`),
      `the over-counting note should say ${other.length}`,
    );
  });

  it('states the audit split the classifier produces', () => {
    // The audit's headline figures, computed rather than asserted — which is
    // the whole of this ticket applied to its own record.
    assert.equal(exercises.length + readsOnly.length, workflow.length + other.length);
    assert.ok(
      ticket.includes(`**${exercises.length} exercise the`),
      `the ticket should say ${exercises.length} files exercise the subject`,
    );
    assert.ok(
      ticket.includes(`**${readsOnly.length} read only**`),
      `the ticket should say ${readsOnly.length} read only`,
    );
  });

  it('states the population size wherever the Investigation Tasks restate it', () => {
    // Two sites in one bullet, and the total was covered by nothing — the
    // ticket's own shape (the unit of a correction is the claim, not the
    // locality) reproduced inside its task list.
    // Each pattern CAPTURES the population cardinal, and the capture is
    // compared. An `includes(String(total))` over the whole matched span would
    // pass on the wrong number whenever the span carries a second cardinal:
    // at total 10, the stale text "32 files, 10 of them reading" contains
    // "10" and satisfies it. Matching the number you mean is the difference
    // between a check and a coincidence.
    // Patterns track the ticket's CURRENT phrasing. They changed on 2026-08-19
    // when the per-file audit landed and rewrote the section — and the guard
    // caught that itself, failing on `found 0` rather than passing vacuously
    // over a population whose wording had moved. That floor is why the rewrite
    // could not silently orphan the check.
    // Each pattern must match at least once AND every match must carry the
    // computed value. Asserting per-pattern rather than a total: a total floor
    // is a magic number that goes stale when a site is added or removed, and
    // it cannot tell "one site vanished" from "another gained a match".
    const sites = [
      { pattern: /(\d+) files read a repo file and assert/g, expected: workflow.length + other.length },
      { pattern: /of the (\d+) read-only files/g, expected: readsOnly.length },
    ];
    for (const { pattern, expected } of sites) {
      const matches = ticket.matchAll(pattern).toArray();
      assert.ok(
        matches.length > 0,
        `no restatement site matched ${pattern} — the wording moved and this check went vacuous`,
      );
      for (const match of matches) {
        assert.equal(
          Number(match[1]),
          expected,
          `"${match[0].replaceAll(/\s+/g, ' ').trim()}" disagrees with the computed ${expected}`,
        );
      }
    }
  });

  it('states the three INTERSECTION cardinals, which the singletons do not cover', () => {
    // classify() has returned all four sets since the audit landed, but only
    // their singleton sizes were ever asserted. Seven, ten and three are
    // intersections, stated as prose, and the ticket's own limits section
    // declared the unguarded set EMPTY while these sat inside it.
    //
    // Not hypothetical staleness: the population moved 31 -> 32 this month and
    // the guard fired. On the next move every guarded cardinal updates and
    // these three go stale under a green suite — and the ticket's surviving
    // conclusion ("no runtime to feed them" is true of seven, not ten) rests
    // on exactly these.
    const flat = ticket.replaceAll(/\s+/g, ' ');
    for (const [label, phrase] of [
      ['workflow ∩ readsOnly', `${cap(wordOf(inBoth(workflow, readsOnly)))} read \`.github/workflows/**\``],
      ['other ∩ readsOnly', `The other ${wordOf(inBoth(other, readsOnly))} check declarative artefacts`],
      ['workflow ∩ exercises', `**${wordOf(inBoth(workflow, exercises))} already spawn a runtime**`],
    ]) {
      // Occurrence count, not membership. This document deliberately retains
      // superseded prose verbatim, so `includes` stays green if the LIVE
      // sentence is deleted while a history block still carries the same
      // wording — and the same shape if the population returns to a value some
      // superseded block states. Exactly one live statement, or fail.
      const occurrences = flat.split(phrase).length - 1;
      assert.equal(occurrences, 1, `${label}: expected exactly one "${phrase}", found ${occurrences}`);
    }
  });

  it('sums the Step 4 verdict table — ARITHMETIC ONLY; the verdicts are judged, not computed', () => {
    // Scope is in the title deliberately. The objection to this guard was that
    // it would read as though the wiring/sentinel/decision classification were
    // mechanised when it is a hand-read judgement — and the answer is the same
    // device the under-listing check above already uses: say what it covers in
    // the name. It checks that the rows add up, nothing more.
    //
    // Worth having because the slip it catches fired one revision ago: the
    // table summed to 12 across five files while the prose above said 13
    // across six, and a human review caught it. The table has a scheduled next
    // edit — two candidate files are named as pending a per-pin read.
    // Rows come from the TABLE's own boundaries, not from a filename list. A
    // list goes silently partial the moment a row is added for a file it does
    // not name — and two more files are already named in the ticket as pending
    // a per-pin read, so that edit is scheduled. Under-listing is the direction
    // that has actually fired on this guard twice.
    const lines = ticket.split('\n');
    const header = lines.findIndex((l) => /^\s*\|\s*file\s*\|\s*pin\s*\|\s*verdict\s*\|/.test(l));
    assert.notEqual(header, -1, 'the Step 4 verdict table must be present');
    const rows = [];
    const afterHeader = lines.slice(header + 2);
    for (const line of afterHeader) {
      if (!/^\s*\|/.test(line)) break;
      rows.push(line);
    }
    assert.ok(rows.length >= 8, `expected the verdict table, found ${rows.length} rows`);
    const tally = { wiring: 0, sentinel: 0, decision: 0 };
    let pins = 0;
    for (const row of rows) {
      const multiplier = /, x2 \|/.test(row) ? 2 : 1;
      pins += multiplier;
      const verdict = /\| sentinel/.test(row)
        ? 'sentinel'
        : /\| DECISION/.test(row)
          ? 'decision'
          : 'wiring';
      tally[verdict] += multiplier;
    }
    const stated = ticket
      .replaceAll(/\s+/g, ' ')
      .match(/\*\*(\w+) pins across (\w+) files: (\d+) wiring, (\d+) sentinels, (\d+) decisions/);
    assert.ok(stated, 'the Step 4 conclusion sentence must be present');
    assert.equal(pins, WORDS.indexOf(stated[1].toLowerCase()), `table rows sum to ${pins}`);
    assert.equal(tally.wiring, Number(stated[3]), `table has ${tally.wiring} wiring rows`);
    assert.equal(tally.sentinel, Number(stated[4]), `table has ${tally.sentinel} sentinel rows`);
    assert.equal(tally.decision, Number(stated[5]), `table has ${tally.decision} decision rows`);

    // stated[2] was captured by the regex and never compared — and it is
    // precisely the cardinal that moves when the two pending files are read.
    const files = new Set(rows.map((r) => r.match(/^\s*\|\s*`([^`]+)`/)?.[1]).filter(Boolean));
    assert.equal(files.size, WORDS.indexOf(stated[2].toLowerCase()), `table names ${files.size} files`);

    // `six` and `nine` are arithmetic over this tally, not judgement: six is
    // the decisions, nine is decisions plus the wiring rows that the unsettled
    // rule would reclassify. Guarding them mechanises no verdict.
    const flat = ticket.replaceAll(/\s+/g, ' ');
    assert.ok(
      flat.includes(`of which ${wordOf(tally.decision)} to ${wordOf(tally.decision + tally.wiring)} are illegitimate`),
      `headline should read "${wordOf(tally.decision)} to ${wordOf(tally.decision + tally.wiring)} are illegitimate"`,
    );
  });

  it('does not restate a cardinal the predicate contradicts', () => {
    // Derived from the live counts, so these stay live as the population moves
    // — a hardcoded 'Those nine files' would go inert the moment the answer
    // became eleven, which is how a denylist rots into decoration.
    //
    // This pins the phrasings that actually fired after the table was
    // corrected. A denylist cannot close the restatement class in general and
    // this does not claim to: what closes it is the cardinal assertions above,
    // which fail on the value wherever the value is wrong.
    const n = workflow.length;
    for (const phrase of [
      `${n - 1} of them reading workflow YAML`,
      `${n + 1} of them reading workflow YAML`,
      `the ${n - 1} workflow-reading files`,
      `${other.length + 1} files, of which the`,
    ]) {
      assert.ok(!ticket.includes(phrase), `stale cardinal left in the ticket: "${phrase}"`);
    }

    // The ticket spells one cardinal as an English word, so it is checked by
    // reading the word back and requiring agreement, not by denylisting the
    // wrong one. An earlier version denylisted the literal 'Those nine files',
    // which would go inert the moment the answer became eleven — and which I
    // then dropped while deriving the others, silently removing the only cover
    // for that phrasing. Mutation testing is what surfaced that.
    assert.ok(WORDS[n], `extend WORDS to cover ${n} before this check can speak`);
    const spelled = ticket.match(/Those (\w+) files pin YAML/);
    assert.ok(spelled, 'the ticket must carry the "Those <n> files pin YAML" claim');
    assert.equal(spelled[1], WORDS[n], `the ticket spells the workflow count as "${spelled[1]}" but it is ${n}`);
  });
});
