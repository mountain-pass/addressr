// The risk register must agree with itself.
//
// Why this exists (R028): the scaffold path is mechanical — a pipeline hint
// becomes a `docs/risks/R<NNN>-<slug>.active.md` with the ADR-026 ungrounded
// sentinel in every scoring field — while the curation path is entirely by hand.
// So the register drifts in two directions with nothing to catch either: new
// entries arrive ungrounded, and existing entries' index rows and prose go stale
// against their own scores.
//
// Both were live on 2026-08-05, at the end of the P083 drain that was supposed to
// have finished: two contradictory above-appetite counts in one document, five
// entries carrying a duplicated `## Change Log`, nine asserting in present tense
// that their own (grounded) scoring fields were ungrounded, and two Descriptions
// still quoting a residual their own Change Log had superseded.
//
// The fifth duplicate Change Log was found by this test on its first run, after a
// by-hand sweep for that exact defect had already been through the directory.
//
// A register that cannot be trusted arithmetically is the thing P083 was opened
// about, one level up.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RISKS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../docs/risks');
const SENTINEL = 'not estimated — no prior data';

// `docs/risks/README.md` § Structure sanctions three status suffixes, not two.
// No `.accepted.md` entry exists today, but one would otherwise be invisible to
// every invariant below — carrying a sentinel and duplicate Change Logs, and
// absent from both index tables, without failing anything. Closed while latent.
const ACTIVE = ['.active.md', '.accepted.md'];

const entries = async (suffixes) =>
  (await readdir(RISKS)).filter(
    (f) => /^R\d{3}-/.test(f) && [suffixes].flat().some((s) => f.endsWith(s)),
  );

// Numerals appear in these entries in word form as often as digits.
const WORDS = ['zero','one','two','three','four','five','six','seven','eight','nine',
  'ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen',
  'eighteen','nineteen','twenty','twenty-one','twenty-two','twenty-three'];
const WORD_NUM = (t) =>
  t === undefined ? NaN : /^\d+$/.test(t) ? Number(t) : WORDS.indexOf(t.toLowerCase());

const scoreOf = (text, which) =>
  text.match(new RegExp(`^- \\*\\*${which} Score\\*\\*:\\s*(\\d+)`, 'm'))?.[1];

describe('docs/risks register invariants (R028)', () => {
  it('no active entry carries the ADR-026 ungrounded-output sentinel', async () => {
    const offenders = [];
    for (const f of await entries(ACTIVE)) {
      if ((await readFile(path.join(RISKS, f), 'utf8')).includes(SENTINEL)) offenders.push(f);
    }
    assert.deepEqual(offenders, [], `entries still ungrounded:\n  ${offenders.join('\n  ')}`);
  });

  it('no entry claims in present tense that its scoring fields are ungrounded', async () => {
    // The scaffold stanza is correct on a fresh scaffold and false the moment the
    // entry is curated. Curated entries must state it in the past tense.
    const stale = [];
    for (const f of await entries(ACTIVE)) {
      const t = await readFile(path.join(RISKS, f), 'utf8');
      if (/fields below carry the ADR-026 ungrounded-output sentinel/.test(t)) stale.push(f);
    }
    assert.deepEqual(stale, [], `present-tense scaffold stanza on curated entries:\n  ${stale.join('\n  ')}`);
  });

  it('each entry has exactly one Change Log', async () => {
    const bad = [];
    for (const f of [...(await entries(ACTIVE)), ...(await entries('.retired.md'))]) {
      const n = ((await readFile(path.join(RISKS, f), 'utf8')).match(/^## Change Log$/gm) || []).length;
      if (n !== 1) bad.push(`${f} (${n})`);
    }
    assert.deepEqual(bad, [], `expected exactly one Change Log:\n  ${bad.join('\n  ')}`);
  });

  it('README Register rows match each entry’s own inherent and residual scores', async () => {
    const readme = await readFile(path.join(RISKS, 'README.md'), 'utf8');
    const mismatches = [];

    for (const f of await entries(ACTIVE)) {
      const id = f.slice(0, 4);
      const text = await readFile(path.join(RISKS, f), 'utf8');
      const row = readme.match(new RegExp(`^\\| \\[${id}\\]\\([^)]*\\)([^\\n]*)$`, 'm'));
      if (!row) {
        mismatches.push(`${id}: no Register row`);
        continue;
      }
      // row[1] starts at the `|` after the link, so cells[0] is empty:
      // ['', Title, Category, Inherent, Residual, Treatment, Owner, Review, '']
      const cells = row[1].split('|').map((c) => c.trim());
      const [rowInherent, rowResidual] = [cells[3], cells[4]];
      const inherent = scoreOf(text, 'Inherent');
      const residual = scoreOf(text, 'Residual');
      if (inherent !== rowInherent) mismatches.push(`${id}: inherent entry=${inherent} README=${rowInherent}`);
      if (residual !== rowResidual) mismatches.push(`${id}: residual entry=${residual} README=${rowResidual}`);
    }

    assert.deepEqual(mismatches, [], `Register table disagrees with the entries:\n  ${mismatches.join('\n  ')}`);
  });

  it('R028 states the drift-table total its own scoring cites', async () => {
    // Sixth instance of the class, found by the scorer: adding a row to R028's
    // drift table left the "Nineteen instances" figure grounding its Inherent
    // Likelihood pointing at a table that now summed to twenty. A total asserted
    // in prose against an enumeration in the same file — exact, so checkable.
    const f = (await entries(ACTIVE)).find((x) => x.startsWith('R028'));
    const t = await readFile(path.join(RISKS, f), 'utf8');
    const rows = [...t.matchAll(/^\|(?![\s-]*\|)(?!\s*Drift).*\|\s*(\d+)\s*\|\s*$/gm)];
    const summed = rows.reduce((a, m) => a + Number(m[1]), 0);
    const claimed = t.match(/\*\*(\w+)\*\* instances in the batch tabled above/)?.[1];
    assert.equal(
      WORD_NUM(claimed),
      summed,
      `R028 cites "${claimed}" instances; its drift table sums to ${summed} over ${rows.length} rows`,
    );
  });

  it('R028 states how many checks its control actually runs', async () => {
    // Fifth instance: widening the test left R028 describing "five invariants"
    // while the file had six. The entry understated the coverage of its own
    // control, in the batch that widened it.
    const self = await readFile(fileURLToPath(import.meta.url), 'utf8');
    const actual = (self.match(/^ {2}it\(/gm) || []).length;
    const f = (await entries(ACTIVE)).find((x) => x.startsWith('R028'));
    const t = await readFile(path.join(RISKS, f), 'utf8');
    const claimed = t.match(/asserts \*\*(\w+)\*\* invariants/)?.[1];
    assert.equal(
      WORD_NUM(claimed),
      actual,
      `R028 says the test asserts "${claimed}" invariants; it has ${actual}`,
    );
  });

  it('any document claiming the above-appetite partition agrees with the entries', async () => {
    // The other checks scan docs/risks/ only, so a count asserted in a
    // ticket that cites the register passes them. That is not a hypothetical gap:
    // re-scoring R028 from 2 to 6 moved the partition from ten-of-16 to
    // eleven-of-16, and P083's close-out kept saying ten — the fourth instance of
    // this class in four batches, and the third that a by-hand pass missed.
    //
    // This is arithmetic that happens to live in prose, not prose. It is computed
    // from the same score cells the README-row check already parses, so it stays exact.
    const APPETITE = 5; // RISK-POLICY.md, inclusive — a residual of 5 is within

    const residuals = [];
    for (const f of await entries(ACTIVE)) {
      const n = scoreOf(await readFile(path.join(RISKS, f), 'utf8'), 'Residual');
      residuals.push({ id: f.slice(0, 4), score: Number(n) });
    }
    const above = residuals.filter((r) => r.score > APPETITE).length;
    const total = residuals.length;

    const asNumber = WORD_NUM;
    const CLAIM = /\*\*(\w+) of the (\d+) sit above appetite\*\*/gi;

    const docs = path.resolve(RISKS, '..');
    const wrong = [];
    const walk = async (dir) => {
      for (const e of await readdir(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) await walk(p);
        else if (e.name.endsWith('.md')) {
          for (const [, n, m] of (await readFile(p, 'utf8')).matchAll(CLAIM)) {
            if (asNumber(n) !== above || Number(m) !== total) {
              wrong.push(`${path.relative(docs, p)}: claims ${n} of ${m}, computed ${above} of ${total}`);
            }
          }
        }
      }
    };
    await walk(docs);

    assert.deepEqual(wrong, [], `above-appetite claims disagree with the register:\n  ${wrong.join('\n  ')}`);
  });

  it('no entry refers to a check by its position', async () => {
    // Seventh instance: two positional references survived after the rest of R028
    // moved to named form — and they carried different literals with different
    // fates. One was correct when written and stayed correct; the other was also
    // correct when written and went wrong the moment a check landed ahead of it. Positional references drift whenever the list
    // changes, which is every time this file grows. Naming is the fix; this
    // makes the convention mechanical rather than remembered.
    const offenders = [];
    for (const f of [...(await entries(ACTIVE)), ...(await entries('.retired.md'))]) {
      const t = await readFile(path.join(RISKS, f), 'utf8');
      for (const m of t.matchAll(/invariant\s+\d+/gi)) offenders.push(`${f}: "${m[0]}"`);
    }
    assert.deepEqual(offenders, [], `refer to checks by name, not position:\n  ${offenders.join('\n  ')}`);
  });

  it('every active entry is listed in the Register and every retired one in Retired', async () => {
    const readme = await readFile(path.join(RISKS, 'README.md'), 'utf8');
    const register = readme.slice(readme.indexOf('## Register'), readme.indexOf('## Retired'));
    const retired = readme.slice(readme.indexOf('## Retired'));
    const missing = [];

    for (const f of await entries(ACTIVE)) if (!register.includes(f)) missing.push(`${f} absent from Register`);
    for (const f of await entries('.retired.md')) if (!retired.includes(f)) missing.push(`${f} absent from Retired`);

    assert.deepEqual(missing, [], `index does not cover the register:\n  ${missing.join('\n  ')}`);
  });
});
