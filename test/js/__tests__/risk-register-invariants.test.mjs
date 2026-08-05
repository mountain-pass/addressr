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

// Markdown code spans and blockquotes are STRUCTURAL quotation markers, so an
// entry can exhibit its own past errors verbatim without a check reading them as
// live claims. Token-local by design: the marker sits at the claim, so using one
// to dodge a check is legible on sight.
// Code-span only. An earlier version also stripped blockquote lines as
// "structural quotation", which is false for THIS corpus: blockquotes here are
// admonitions carrying live prescriptive claims — R010's "Band basis. … Do not
// silently correct Medium to Low", the "Filename retained deliberately" callout
// on R004, R020 and R023. Exempting them would have let a claim escape by
// wearing the register's own house style, which is the opposite of the
// legible-on-sight property the exemption is justified by.
const unquoted = (text) => text.replace(/`[^`\n]*`/g, '');

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

  it('every cited residual figure matches that entry’s own score cell', async () => {
    // Arithmetic that happens to live in prose, one level out from the appetite
    // partition. P083's above-appetite enumeration cited "R028 at 6" after R028
    // moved to 8 — and the partition check stayed correctly green, because the
    // digit it checks ("Eleven of the 16") was still right while the enumeration
    // forty characters later was not. Same sentence, one checked clause and one
    // unchecked one.
    const scores = new Map();
    for (const f of await entries(ACTIVE)) {
      scores.set(f.slice(0, 4), scoreOf(await readFile(path.join(RISKS, f), 'utf8'), 'Residual'));
    }

    // "R028 at 6", "R003/R008/R009 at 8", "R004 and R027 at 9" — a run of IDs
    // sharing one figure. The separator accepts a bare "and": without it the run
    // stopped at the first ID and left the rest of the sentence unchecked.
    const CITED = /\b(R\d{3}(?:(?:[/,]\s*|\s+and\s+)(?:and\s+)?R\d{3})*)\s+at\s+(\d+)\b/g;

    // An entry must be able to exhibit its own past errors verbatim — that is what
    // the audit trail is for, and paraphrasing evidence into assertion is the
    // defect this whole file exists to catch. Markdown's code span and blockquote
    // are STRUCTURAL quotation markers, not a heuristic, so exempting them keeps
    // the check exact while letting the register quote a superseded citation.
    // Backticking a live claim to dodge the check is legible on sight.

    const docs = path.resolve(RISKS, '..');
    const wrong = [];
    const walk = async (dir) => {
      for (const e of await readdir(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) await walk(p);
        else if (e.name.endsWith('.md')) {
          const text = unquoted(await readFile(p, 'utf8'));
          for (const [, ids, figure] of text.matchAll(CITED)) {
            for (const id of ids.match(/R\d{3}/g)) {
              const actual = scores.get(id);
              if (actual !== undefined && actual !== figure) {
                wrong.push(`${path.relative(docs, p)}: cites ${id} at ${figure}, its cell says ${actual}`);
              }
            }
          }
        }
      }
    };
    await walk(docs);
    assert.deepEqual(wrong, [], `stale score citations:\n  ${wrong.join('\n  ')}`);
  });

  it('a referring document is not older than the entry it describes', async () => {
    // Mechanises the scope rule R028 records: when an entry's state moves, every
    // file carrying an inbound reference to it has to be revisited. Three sweeps
    // in a row missed that by hand — by phrase, then intra-file, then by scoping
    // the enumeration to the wrong changed-set.
    //
    // Commit order rather than the `Last reviewed` field, deliberately: that
    // field cannot order two edits made on the same day, which is exactly the
    // case that slipped (R015 was curated the same day R020 moved). Files with
    // uncommitted edits count as current — you are editing them now — so a batch
    // that touches an entry and its referrers together passes.
    const { execFileSync } = await import('node:child_process');
    const docsRoot = path.resolve(RISKS, '../..');
    const git = (args) => execFileSync('git', args, { cwd: docsRoot, encoding: 'utf8' }).trim();
    // Under a shallow clone every `git log -1 --format=%ct -- <path>` returns
    // empty, touched() falls to 0, every comparison becomes 0 < 0, and the check
    // passes having done no work. It shipped that way: both jobs running
    // `test:js` used a bare actions/checkout (fetch-depth: 1). Fail loudly rather
    // than green-and-inert — a check that cannot run must say so.
    assert.equal(
      git(['rev-parse', '--is-shallow-repository']),
      'false',
      'shallow clone: this check needs full history (set fetch-depth: 0 on the job running test:js)',
    );

    // --no-renames is load-bearing. A staged rename prints `R  old -> new`, and
    // `slice(3)` then yields the literal "old -> new", matching neither path: the
    // file drops out of `dirty` and falls to a `git log` on a path with no
    // commits, which returns empty → 0. As referrer it is then older than
    // everything; as target it fences nobody. This register retires entries by
    // `git mv` + `git add`, so that is the common case, not an edge one.
    const dirty = new Set(
      git(['status', '--porcelain', '--no-renames'])
        .split('\n')
        .map((l) => l.slice(3).trim())
        .filter(Boolean),
    );
    const touched = (rel) =>
      dirty.has(rel) ? Infinity : Number(git(['log', '-1', '--format=%ct', '--', rel]) || 0);

    // ASYMMETRIC, and the asymmetry is the point — an earlier version cut both
    // axes the same way and lost a bounded, high-value half.
    //
    // TARGETS include retired entries. A retired file's timestamp is frozen, so it
    // flags only active referrers untouched since that retirement — once each, then
    // permanently green, because the file never moves again. Bounded by
    // construction. And retirement is the single largest state change an entry
    // undergoes, so an active entry still describing a retired one as live is
    // exactly what this check is for; under an active-only scope the `git mv` that
    // retires an entry is the one change that drops it from the fenced set.
    //
    // REFERRERS stay active-only. A retired referrer is permanently older than any
    // entry that moves after it, so it re-flags forever, and its only available
    // remedy is a null touch to bump a timestamp on a frozen record. A check whose
    // remedy is a no-op does not get waived, it gets performed — which converts a
    // real signal into a ritual. Retired records are kept honest by date-scoping
    // their claims when written, not by perpetual maintenance.
    const targets = [...(await entries(ACTIVE)), ...(await entries('.retired.md'))];
    const active = await entries(ACTIVE);
    const stale = [];
    for (const target of targets) {
      const id = target.slice(0, 4);
      const targetRel = path.relative(docsRoot, path.join(RISKS, target));
      const targetAt = touched(targetRel);
      // A dirty target counts as changing NOW rather than being skipped, so a
      // clean referrer of a moving entry fails at COMMIT time — the verdict
      // that would otherwise first land in CI, on the commit arming the check.
      // All four quadrants still behave: both dirty passes (Infinity < now is
      // false), both clean is unchanged, and a dirty referrer of a clean
      // target passes. This retires the `examined > 0` guard, which passed
      // this batch on the nine entries the batch never touched.
      const targetTime = targetAt === Infinity ? Date.now() / 1000 : targetAt;

      for (const referrer of active) {
        if (referrer === target) continue;
        const rRel = path.relative(docsRoot, path.join(RISKS, referrer));
        // Exemption is TOKEN-level, not region-level. A first version excluded
        // the whole `## Change Log` section on the theory that such mentions are
        // audit-trail prose — but it closed none of the ten stale pairs it was
        // taken to close (all were body-resident) and it unsaw a real live claim:
        // R022's only reference to R028 is a present-tense assertion about R028's
        // Controls section, living in R022's Change Log. A heading sixty lines
        // away says nothing about whether a given sentence asserts about now.
        // A backtick sits AT the claim, which is what makes the code-span
        // analogy hold — and it is why the register's own remedy for a fence
        // failure (write a verification bullet) does not create blind spots.
        if (!unquoted(await readFile(path.join(RISKS, referrer), 'utf8')).includes(id)) continue;
        if (touched(rRel) < targetTime) {
          stale.push(`${referrer} references ${id} but predates its last change`);
        }
      }
    }
    assert.deepEqual(stale, [], `referring entries not revisited:\n  ${stale.join('\n  ')}`);
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
