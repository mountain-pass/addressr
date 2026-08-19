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

const testsDir = fileURLToPath(new URL('.', import.meta.url));
const ticketPath = fileURLToPath(
  new URL(
    '../../../docs/problems/open/033-source-inspection-tests-anti-pattern.md',
    import.meta.url,
  ),
);

// The predicate exactly as the ticket publishes it. If this and the ticket's
// prose ever diverge, that is the defect — change both together.
function classify() {
  const workflow = [];
  const other = [];
  // This file is excluded from its own population. It reads test files and
  // asserts, and it quotes '.github/workflows' while explaining the predicate,
  // so it classifies itself into the group it measures and shifts every figure
  // by one. The observer belongs outside the sample; naming the exclusion here
  // is what keeps that from being a silent thumb on the scale.
  const SELF = 'p033-population-figures-recompute.test.mjs';
  for (const file of readdirSync(testsDir)) {
    if (file === SELF || !file.endsWith('.test.mjs')) continue;
    const source = readFileSync(path.join(testsDir, file), 'utf8');
    if (!/readFileSync|readFile\(|readdirSync/.test(source)) continue;
    if (!source.includes('assert.')) continue;
    (source.includes('.github') && source.includes('workflows') ? workflow : other).push(file);
  }

  return { workflow, other };
}

describe('P033 population figures recompute from the ticket’s own predicate', () => {
  const ticket = readFileSync(ticketPath, 'utf8');
  const { workflow, other } = classify();

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
    const start = ticket.indexOf('The ten are');
    assert.notEqual(start, -1, 'the ticket must carry the named list');
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
    const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
    assert.ok(WORDS[n], `extend WORDS to cover ${n} before this check can speak`);
    const spelled = ticket.match(/Those (\w+) files pin YAML/);
    assert.ok(spelled, 'the ticket must carry the "Those <n> files pin YAML" claim');
    assert.equal(spelled[1], WORDS[n], `the ticket spells the workflow count as "${spelled[1]}" but it is ${n}`);
  });
});
