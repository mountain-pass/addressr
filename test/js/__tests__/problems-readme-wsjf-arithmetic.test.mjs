// Every WSJF cell in the problem backlog must equal the documented formula.
//
// WHY THIS EXISTS. `wr-itil-reconcile-readme docs/problems` exits 0 on a table
// with wrong WSJF cells. It checks that each row's STATUS agrees with the
// ticket's state on disk — it never reads Priority, and it never does the
// arithmetic. So the tool that certifies the table does not check the thing the
// table exists to express, and its exit code reads as "the table is correct".
//
// That matters because `docs/problems/README.md` line 8 states the rendered row
// order matches `/wr-itil:work-problems` Step 3 selection 1:1. A wrong cell is a
// wrong work selection, not a cosmetic blemish.
//
// Found 2026-08-19 by a risk-scoring pass, after `reconcile exits 0` was cited
// as evidence a commit was sound. Six of forty-six rows were wrong. Two were
// written that day and the day before by the capture path; the rest predate it.
// The same class as the k6 threshold over an empty sample set and the license
// gate over an empty dependency tree — a green check that does not check.
//
// THE FORMULA is not this repo's invention. `/wr-itil:review-problems` SKILL.md
// step 8: "Calculate WSJF = (Severity × Status Multiplier) / Effort Divisor.
// Status Multiplier is 1.0 for Open, 2.0 for Known Error."
//
// SCOPE LIMIT, stated so the green is not read as wider than it is: only rows
// whose Status is one the multiplier table defines. The three rows carrying an
// upstream-tracking status (P086, P080, P082) are skipped, because no multiplier
// is documented for that status — and there is not even an undocumented one to
// infer: P086 (16 -> 8.0) and P082 (12 -> 6.0) sit at severity/2, but P080
// (6 -> 6.0) sits at severity/1. That inconsistency is the justification for
// skipping rather than guessing a rule.
//
// The exemption binds on IDENTITY as well as count. A ceiling alone does not
// bind: retiring one upstream row and adding a different undocumented status
// holds the total at three and passes silently.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const readme = path.join(repoRoot, 'docs', 'problems', 'README.md');

const EFFORT_DIVISOR = { S: 1, M: 2, L: 4, XL: 8 };
const STATUS_MULTIPLIER = { Open: 1, 'Known Error': 2 };
// RISK-POLICY.md § Label Bands. The label is the other half of the Severity
// cell, and README.md line 8 keys the Tier 0 partition on it ("Severity Very
// High >=17"), so a label disagreeing with its number mis-tiers the row.
const BANDS = [
  [1, 2, 'Very Low'],
  [3, 4, 'Low'],
  [5, 9, 'Medium'],
  [10, 16, 'High'],
  [17, 25, 'Very High'],
];
const bandFor = (n) => BANDS.find(([lo, hi]) => n >= lo && n <= hi)?.[2];
const scored = (r) => Object.hasOwn(STATUS_MULTIPLIER, r.status);

const rows = () => {
  const out = [];
  for (const line of readFileSync(readme, 'utf8').split('\n')) {
    // SEVERITY BAND MUST ALLOW SPACES. The first version of this matcher used
    // `\w+\s*\(`, which cannot span a space — so `Very Low (2)` and
    // `Very High (N)` never matched, and those rows left the corpus entirely:
    // not scored, not skipped, not counted. P046 (`Very Low (2)`) was invisible
    // on the day this guard was written, and the band it excluded includes
    // `Very High (>=17)`, which README.md line 8 defines as the Tier 0
    // critical-bypass tier. A guard blind to the highest-severity tier, blind
    // silently, is the exact class this file exists to close — reproduced inside
    // it. The `total > 30` floor was too loose to notice 45 where 46 was right,
    // which is why the count is now asserted by EQUALITY below.
    const m = line.match(
      /^\|\s*([\d.]+)\s*\|\s*(P\d+)\s*\|([^|]+)\|\s*([A-Za-z]+(?:\s+[A-Za-z]+)*)\s*\((\d+)\)\s*\|\s*([^|]+?)\s*\|\s*(S|M|L|XL)\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|/,
    );
    if (!m) continue;
    const [, wsjf, id, , band, severity, status, effort, reported] = m;
    out.push({ wsjf: Number(wsjf), id, band, severity: Number(severity), status, effort, reported });
  }
  return out;
};

describe('problem backlog — every WSJF cell matches the documented formula', () => {
  it('parses every table row, so none can drop out of the corpus unseen', () => {
    // A FLOOR IS NOT AN EQUALITY, and that distinction is why this guard shipped
    // blind. Count the raw table rows independently of the parser, then require
    // the parser to have accounted for all of them. A row the matcher cannot
    // read must fail loudly here rather than leave the corpus in silence.
    const lines = readFileSync(readme, 'utf8').split('\n');
    const head = lines.findIndex((l) => /^\|\s*WSJF\s*\|/.test(l));
    assert.ok(head >= 0, 'the WSJF Rankings table header has moved or gone — the guard has no corpus');
    const raw = [];
    for (let i = head + 2; i < lines.length && lines[i].startsWith('|'); i += 1) raw.push(lines[i]);
    const all = rows();
    assert.equal(
      all.length,
      raw.length,
      `${raw.length} WSJF table rows present but only ${all.length} parsed — ` +
        `${raw.length - all.length} dropped silently. Unparsed: ` +
        raw.filter((l) => !all.some((r) => l.includes(`| ${r.id} |`))).join(' // '),
    );
    assert.ok(all.length > 30, `only ${all.length} WSJF rows found — the table itself has rotted`);
    const inScope = all.filter(scored);
    assert.ok(inScope.length > 25, `only ${inScope.length} rows carry a documented status`);
  });

  it('computes (Severity × Status Multiplier) / Effort Divisor for every scored row', () => {
    const wrong = [];
    for (const r of rows()) {
      const mult = scored(r) ? STATUS_MULTIPLIER[r.status] : undefined;
      if (mult === undefined || !scored(r)) continue;
      const expected = (r.severity * mult) / EFFORT_DIVISOR[r.effort];
      if (Math.abs(r.wsjf - expected) > 0.01) {
        wrong.push(
          `${r.id}: listed ${r.wsjf}, formula gives ${expected} ` +
            `(severity ${r.severity} × ${mult} for ${r.status} ÷ ${EFFORT_DIVISOR[r.effort]} for Effort ${r.effort})`,
        );
      }
    }
    assert.deepStrictEqual(wrong, [], `\n${wrong.join('\n')}\n`);
  });

  it('agrees the severity label with the severity number', () => {
    // The matcher was widened so multi-word labels parse, and then discarded
    // the label it had gone to the trouble of capturing. The arithmetic keys on
    // the number; the Tier 0 partition keys on the label. `Low (12)` would
    // compute and sort correctly while displaying a contradiction.
    const wrong = rows()
      .filter((r) => r.band !== bandFor(r.severity))
      .map((r) => `${r.id}: labelled "${r.band}" but ${r.severity} is ${bandFor(r.severity)}`);
    assert.deepStrictEqual(wrong, [], `\n${wrong.join('\n')}\n`);
  });

  it('renders rows in the documented selection order', () => {
    // WHY THIS BELONGS HERE: the header above justifies this whole file by
    // README.md line 8 — rendered order matches /wr-itil:work-problems Step 3
    // selection 1:1, so a wrong cell is a wrong work selection. That rationale
    // is about ORDER, and the checks above are all about CELLS. The table was
    // re-sorted by hand in the same batch that added this guard, which makes
    // the sort the least-verified part of it.
    const key = (r) => [
      -r.wsjf,
      r.status === 'Known Error' ? 0 : 1,
      EFFORT_DIVISOR[r.effort],
      r.reported,
      r.id,
    ];
    const all = rows();
    const out = [];
    for (let i = 1; i < all.length; i += 1) {
      const [a, b] = [key(all[i - 1]), key(all[i])];
      for (let k = 0; k < a.length; k += 1) {
        if (a[k] === b[k]) continue;
        if (a[k] > b[k]) {
          out.push(`${all[i - 1].id} precedes ${all[i].id} but sorts after it (differ at key ${k})`);
        }
        break;
      }
    }
    assert.deepStrictEqual(out, [], `\n${out.join('\n')}\n`);
  });

  it('does not let the undocumented-status exemption widen unnoticed', () => {
    // Rows skipped above are invisible to the arithmetic check. Bind them on
    // SHAPE, not just count, so swapping one undocumented status for another
    // cannot hold the total at three and pass.
    const skipped = rows().filter((r) => !scored(r));
    const unexpected = skipped.filter((r) => !/^Upstream #\d+$/.test(r.status));
    assert.deepStrictEqual(
      unexpected.map((r) => `${r.id}=${r.status}`),
      [],
      'a status with no documented WSJF multiplier, and not the known upstream-tracking shape, ' +
        'has entered the table. Define its multiplier in /wr-itil:review-problems rather than widening this.',
    );
    assert.ok(
      skipped.length <= 3,
      `${skipped.length} rows carry an undocumented-multiplier status ` +
        `(${skipped.map((r) => `${r.id}=${r.status}`).join(', ')}). Raise this ceiling deliberately, not by drift.`,
    );
  });
});
