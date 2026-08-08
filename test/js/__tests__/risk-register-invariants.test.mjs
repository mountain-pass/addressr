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
import { readFileSync } from 'node:fs';
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
// Returns NaN for anything that is not a numeral. Deliberately NOT indexOf's -1:
// a bare -1 is an integer, so an `isInteger` guard lets a non-numeral through, and
// a word like "successful" captured by a loose \w+ then compares as a count.
const WORD_NUM = (t) => {
  if (t === undefined) return NaN;
  if (/^\d+$/.test(t)) return Number(t);
  const i = WORDS.indexOf(t.toLowerCase());
  return i === -1 ? NaN : i;
};

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

// A `## Canonical state` block DECLARES phrasings that must not appear as live
// claims. It is a spec, not an assertion, so every content check has to skip it —
// otherwise declaring a forbidden form trips the check that forbids it. Learned
// the direct way: R020's declaration table tripped the apply-count check.
const withoutCanonical = (text) => {
  const start = text.indexOf('\n## Canonical state\n');
  if (start === -1) return text;
  const after = text.indexOf('\n## ', start + 1);
  return text.slice(0, start) + (after === -1 ? '' : text.slice(after));
};

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
      // Widened: the digit form was the narrow case. Ordinal WORDS and the noun
      // "check" are the same defect — `The twelfth check` goes silently wrong the
      // moment a check lands ahead of position twelve, which is the argument this
      // rule is made from. Mechanising it beats disclosing the narrowing.
      const ORD = 'first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth';
      const POSITIONAL = new RegExp(`\\b(?:invariant|check)\\s+\\d+\\b|\\b(?:${ORD})\\s+(?:invariant|check)\\b`, 'gi');
      // Dated Change Log bullets are exempt, per the same rule the fence and the
      // apply-count check apply: a `- YYYY-MM-DD:` line records what was true then.
      // "Twelfth check landed" on 2026-08-05 stays true; a body-prose ordinal does not.
      for (const line of unquoted(withoutCanonical(t)).split('\n')) {
        if (/^\s*-\s*\d{4}-\d{2}-\d{2}:/.test(line)) continue;
        for (const m of line.matchAll(POSITIONAL)) offenders.push(`${f}: "${m[0]}"`);
      }
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
    // NOT via git() — that helper trims the whole output, which strips the leading
    // space of porcelain's first line ("​ M path"), so slice(3) then eats a
    // character and the FIRST dirty file silently falls out of the set. It did,
    // every run, from the moment this check landed: a dirty referrer scored as
    // clean and was reported stale against a target it was being edited alongside.
    // A check that fails open on its first input is the shape this file exists for.
    const porcelain = execFileSync('git', ['status', '--porcelain', '--no-renames'], {
      cwd: docsRoot,
      encoding: 'utf8',
    });
    const dirty = new Set(
      porcelain
        .split('\n')
        .filter((l) => l.length > 3)
        .map((l) => l.slice(3).trim()),
    );
    // A Change-Log-only edit is NOT a move. The fence's own remedy for a moved
    // target is "write a verification bullet in the referrer" — which touches the
    // referrer, which makes IT a target, which flags ITS referrers. That is not
    // hypothetical: R008 took two verification bullets today, and each one made
    // R009 flag, so R009 accumulated two bullets whose entire content was
    // "R008's edit was a verification bullet and does not touch our distinction".
    // A check whose remedy re-arms the check generates ritual, and ritual is what
    // the register is trying to stop producing.
    // ponytail: scoped to the DIRTY case — the sitting is where the cascade
    // compounds. Committed history still dates from any commit; widen to a
    // log-walk if a stale pair ever survives a sitting boundary.
    const body = (t) => {
      const i = t.indexOf('\n## Change Log\n');
      return i === -1 ? t : t.slice(0, i);
    };
    const logOnly = (rel) => {
      try {
        const head = execFileSync('git', ['show', `HEAD:${rel}`], { cwd: docsRoot, encoding: 'utf8' });
        return body(head) === body(readFileSync(path.join(docsRoot, rel), 'utf8'));
      } catch {
        return false; // new file, or unreadable — treat as a real move
      }
    };
    // ASYMMETRIC AGAIN, and getting this backwards inverts the check. `logOnly`
    // belongs to the TARGET axis only. On the REFERRER axis a Change-Log-only
    // touch is precisely the prescribed remedy — write a verification bullet —
    // so discounting it there leaves the referrer permanently unable to discharge
    // a fence it has actually answered. A first cut applied it to both and
    // produced exactly that: eleven pairs where the remedy had already been
    // written and the check refused to see it.
    const touched = (rel) =>
      dirty.has(rel) ? Infinity : Number(git(['log', '-1', '--format=%ct', '--', rel]) || 0);
    // WIDENED TO COMMITTED HISTORY 2026-08-09, taking the upgrade path the
    // `ponytail:` note above named: "widen to a log-walk if a stale pair ever
    // survives a sitting boundary." One did, and it turned trunk red.
    //
    // `git log -1` returns the last commit that touched the file AT ALL, so a
    // committed verification bullet dates as a move. The dirty-case exemption
    // made the cascade converge within a sitting; across a commit boundary
    // nothing did, and the reason is that the remedy IS a Change Log edit. The
    // R021 re-rate batch demonstrated it end to end: the batch committed, R009
    // and R027 flagged, bullets were written, and committing THOSE flagged
    // R007, R008 and R028 — entries already in the batch. The reference graph
    // has cycles through R028, which every entry cites, so remedy-by-bullet is
    // not merely expensive, it does not terminate. Measured, not predicted.
    //
    // So the body comparison that already existed for dirty files is now
    // applied to history: walk the commits that touched the file, newest first,
    // and take the first one that changed anything OUTSIDE the Change Log. A
    // file whose only recent commits are verification bullets keeps the date of
    // its last real move, and its referrers stay green.
    const BODY_WALK = 40;
    const show = (ref) => {
      try {
        return execFileSync('git', ['show', ref], { cwd: docsRoot, encoding: 'utf8' });
      } catch {
        return null; // created in this commit, or otherwise absent
      }
    };
    const bodyMovedAt = (rel) => {
      const log = git(['log', `-${BODY_WALK}`, '--format=%H %ct', '--', rel])
        .split('\n')
        .filter(Boolean)
        .map((l) => l.split(' '));
      for (const [sha, ts] of log) {
        const older = show(`${sha}~1:${rel}`);
        // Absent parent means the file was created here, which is a real move.
        // Every git failure inside the walk returns a NEWER date, so it biases
        // toward flagging rather than toward silence.
        if (older === null || body(show(`${sha}:${rel}`) ?? '') !== body(older)) {
          return Number(ts);
        }
      }
      // Nothing but Change Log edits within the window. Date at the oldest
      // commit examined — nearer the truth than the newest, though STILL NEWER
      // than it: a real body move beyond the window is older than everything in
      // it. So window exhaustion fails toward a FALSE RED on a quiet referrer of
      // a chatty target, never toward silence. That direction is the acceptable
      // one, and the remedy terminates in one hop: the referrer axis counts any
      // touch, so a single verification bullet discharges it and, post-widening,
      // does not propagate. Unreachable today at single-digit per-file depth.
      // `log.length === 0` cannot happen for a tracked file — an untracked one
      // is caught by `dirty` and dated Infinity before reaching here.
      return log.length ? Number(log[log.length - 1][1]) : 0;
    };
    const movedAt = (rel) =>
      dirty.has(rel) && !logOnly(rel) ? Infinity : bodyMovedAt(rel);

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
      const targetAt = movedAt(targetRel);
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

  it('every stated push-tier apply count agrees with R021’s canonical cell', async () => {
    // The canonical-cell shape, reused. The score-citation check works because
    // one cell is authoritative and every prose mention is compared against it;
    // this does the same for the fact that drifted hardest — the push-tier apply
    // count, which by 2026-08-05 lived in three sections of R020, two of R021,
    // and P083, one fact across three files. A claim scoped to the register is
    // reachable by no reading radius, which is what a canonical cell is for.
    //
    // Dated bullets are exempt, per the rule R028 states: a `- YYYY-MM-DD:`
    // Change Log entry records what was true on that date and keeps its
    // contemporaneous figure. So is anything explicitly scoped with "as at" or
    // "as of". A bare present-tense count is live and must agree.
    const r021 = await readFile(
      path.join(RISKS, (await entries(ACTIVE)).find((f) => f.startsWith('R021'))),
      'utf8',
    );
    // WIDENED 2026-08-09, and the reason is the check's own subject matter.
    // This read `\b(\w+), all successful`, which bound the canonical count to a
    // phrase asserting every apply had SUCCEEDED. That held for as long as the
    // base rate did, and on 2026-08-08 it stopped: run 31252424980 was a
    // push-tier apply that failed. Correcting the Metrics cell to say so made
    // the extractor find nothing, and the check failed with "must state the
    // canonical apply count" — against a cell that stated it plainly.
    //
    // A check whose extractor encodes a fact the register is supposed to be
    // free to change is a check that reddens on the truth. So the count is now
    // carried by an explicit token that means only "this is the canonical
    // count", and the outcome breakdown is ordinary prose beside it. Same
    // canonical-cell shape as before; the cell is just no longer entangled with
    // a claim about outcomes.
    const canonical = WORD_NUM(
      r021.match(/^- \*\*Metrics\*\*:[^\n]*?\*\*Canonical count: (\w+)\*\*/m)?.[1],
    );
    assert.ok(
      Number.isInteger(canonical),
      "R021 Monitoring Metrics must carry the canonical apply count as `**Canonical count: <numeral>**`. Keep the token verbatim: the outcome breakdown beside it is free prose, and deliberately so — the previous extractor read the count out of an 'all successful' phrase and broke the moment an apply failed.",
    );

    // The cardinal must BIND to the noun phrase, not merely sit adjacent to it.
    // A first version required adjacency and "three successful production applies"
    // backtracked to `\w+ = "successful"`, which WORD_NUM rejects, so the line was
    // skipped — the check's name was wider than its configured value, which is the
    // third consecutive newly-landed check here found narrower than its name.
    // The capture REQUIRES a numeral. Two earlier versions used `\w+` and both
    // failed the same way from opposite ends: adjacency-only skipped "three
    // successful production applies" by binding to "successful", and allowing
    // intervening words then bound to "is" in "Base rate is three successful
    // production applies". A loose capture in a backtracking engine will find
    // some word; it just will not be the one that means anything.
    // Longest-first. Regex alternation is leftmost-first, and WORDS lists
    // `twenty` before `twenty-one`, so "twenty-one applies" would take `twenty`,
    // fail on the hyphen, backtrack and capture `one` — a false red, which is the
    // failure mode that gets a check waived. Latent at an apply count of 4.
    const NUM = ['\\d+', ...[...WORDS].sort((a, b) => b.length - a.length)].join('|');
    // Numeral-required capture AND the noun-phrase anchor. Dropping the anchor
    // made it match "two applies instead of one" in P077, which is about deferral
    // arithmetic, not this axis. Third iteration on this expression: too narrow,
    // then too loose, then anchored at both ends.
    const COUNT = new RegExp(
      `\\b(${NUM})(?:\\s+\\w+){0,2}\\s+(?:production|successful)\\s+applies\\b` +
        `|\\bfired on production\\s+(${NUM})\\s+times\\b`,
      'gi',
    );
    const docs = path.resolve(RISKS, '..');
    const wrong = [];
    const walk = async (dir) => {
      for (const e of await readdir(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) await walk(p);
        else if (e.name.endsWith('.md')) {
          for (const line of unquoted(withoutCanonical(await readFile(p, 'utf8'))).split('\n')) {
            if (/^\s*-\s*\d{4}-\d{2}-\d{2}:/.test(line)) continue; // dated bullet
            if (/\bas (?:at|of)\b/i.test(line)) continue; // explicitly scoped (case-insensitive: entries open sentences with "As at")
            for (const m of line.matchAll(COUNT)) {
              const n = WORD_NUM(m[1] ?? m[2]);
              if (Number.isInteger(n) && n !== canonical) {
                wrong.push(`${path.relative(docs, p)}: states ${m[1] ?? m[2]}, canonical is ${canonical}`);
              }
            }
          }
        }
      }
    };
    await walk(docs);
    assert.deepEqual(wrong, [], `push-tier apply counts disagree with R021:\n  ${wrong.join('\n  ')}`);
  });

  it('no entry contradicts a fact it declares canonical', async () => {
    // The two intra-file moves R028 records as unreached, closed the only way
    // they can be: the same fact restated in several sections, in DIFFERENT
    // wordings, so fixing one leaves the rest. Literal matching cannot find those
    // — the wordings differ — and a generic checker cannot know which sentences
    // assert the same fact.
    //
    // So the entry declares it. A `## Canonical state` table names a fact, its
    // current value, and the phrasings that would contradict it. That makes the
    // enumeration a one-time authored artefact instead of a grep re-run from
    // memory every batch — which is the gap R028 names as "nothing generates the
    // enumeration". Same shape as the apply-count check, generalised so a new
    // fact needs a table row rather than new code.
    //
    // Exemptions match the rest of the file: code spans are quotation, and a
    // `- YYYY-MM-DD:` bullet records what was true then.
    const offenders = [];
    for (const f of [...(await entries(ACTIVE)), ...(await entries('.retired.md'))]) {
      const text = await readFile(path.join(RISKS, f), 'utf8');
      // Sliced, not regex-matched. A lazy `([\s\S]*?)` with a `(?=\n## |$)`
      // lookahead under the `m` flag terminates at the FIRST line end, because `$`
      // is per-line in multiline mode — it captured the empty string and the check
      // silently passed over everything. Same shape as the apply-count regex's
      // three iterations: a subtly wrong expression that fails open.
      const start = text.indexOf('\n## Canonical state\n');
      if (start === -1) continue;
      const after = text.indexOf('\n## ', start + 1);
      const section = text.slice(start, after === -1 ? undefined : after);

      const phrasings = [];
      for (const row of section.split('\n')) {
        if (!row.startsWith('|') || /^\|[\s|-]*\|$/.test(row) || /\|\s*Fact\s*\|/.test(row)) continue;
        const cells = row.split('|').map((c) => c.trim());
        for (const p of (cells[3] ?? '').split(';').map((x) => x.trim()).filter(Boolean)) {
          // Normalise the declared phrase the SAME way the line is normalised, or a
          // phrasing containing a code span can never match: `unquoted()` strips the
          // span from the line, leaving the two sides misaligned.
          phrasings.push({ fact: cells[1], value: cells[2], phrase: unquoted(p).replace(/\s+/g, ' ').trim() });
        }
      }

      // Search the entry with its own declaration table removed, so declaring a
      // phrasing does not itself trip the check.
      const body = withoutCanonical(text);
      for (const line of body.split('\n')) {
        if (/^\s*-\s*\d{4}-\d{2}-\d{2}:/.test(line)) continue;
        const bare = unquoted(line);
        for (const { fact, value, phrase } of phrasings) {
          if (phrase && bare.replace(/\s+/g, ' ').includes(phrase)) {
            offenders.push(`${f}: "${phrase}" contradicts declared ${fact} = ${value}`);
          }
        }
      }
    }
    assert.deepEqual(offenders, [], `entries contradicting their own canonical state:\n  ${offenders.join('\n  ')}`);
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
