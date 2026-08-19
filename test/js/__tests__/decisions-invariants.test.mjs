// @jtbd JTBD-400 (Ship Releases Reliably From Trunk)
//
// Mechanical checks over docs/decisions/. Sibling of risk-register-invariants
// for docs/risks/, which P090 identifies as the same class running uncontrolled
// one tree over.
//
// Every fact asserted here was hand-maintained and unchecked until 2026-08-07,
// when six instances of the class landed in a single day — two created inside
// the remediation for the first two, one inside the ticket filed about the
// class. That is the base rate this file replaces. The controlling argument is
// not that people are careless: a governance index looks derived, so a false
// fact in it is trusted precisely because nobody expects it to be wrong.
//
// RECOVERY NOTE. The compendium is refreshed by a PostToolUse hook on ADR edits,
// which also stages it — so Edit-tool changes keep it fresh. Bash-routed changes
// do NOT fire it (P087: the gate binds to Edit/Write), so a `git mv` status
// transition leaves a stale badge and reds checks 2 and 5. Recover by
// hand-editing the entry. Do NOT run wr-architect-generate-decisions-compendium:
// it is destructive here, stripping hook-authored Decides/Related lines.
//
// SCOPE NOTE. These checks cover docs/decisions/ only. Widening the count check
// beyond it has known casualties — P076 says "37 in-force ADRs" (now 38) and
// P087 carries a date-scoped "41 ADRs on disk" claim that would need a dated
// exemption.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DECISIONS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../docs/decisions',
);

const adrFiles = fs
  .readdirSync(DECISIONS)
  .filter((f) => /^\d{3}-.*\.md$/.test(f))
  .toSorted((a, b) => a.localeCompare(b));

const read = (f) => fs.readFileSync(path.join(DECISIONS, f), 'utf8');
const idOf = (f) => `ADR-${f.slice(0, 3)}`;

/** Frontmatter scalar with surrounding quotes stripped, or undefined. */
const frontmatter = (body, key) => {
  const end = body.indexOf('\n---', 4);
  const head = end === -1 ? body : body.slice(0, end);
  const m = new RegExp(String.raw`^${key}:\s*(.+)$`, 'm').exec(head);
  return m ? m[1].trim().replaceAll(/^['"]|['"]$/g, '') : undefined;
};

const bodyOf = (text) => text.slice(text.indexOf('\n---', 4) + 4);

// All five sanctioned suffixes, not just the two currently in use.
const SANCTIONED = new Set([
  'proposed',
  'accepted',
  'superseded',
  'rejected',
  'deprecated',
]);
const HISTORICAL = new Set(['superseded', 'rejected', 'deprecated']);
const statusOf = (f) => f.replace(/\.md$/, '').split('.').pop();

describe('docs/decisions — hand-maintained facts (P090)', () => {
  it('no capture-adr banner survives ratification asserting the opposite of its own frontmatter', () => {
    // Matches the GENERATED banner literal, not any mention of the phrase.
    // ADR-039 and ADR-040 legitimately retain a provenance paragraph describing
    // how the substance was taken, explicitly "not as a description of the
    // current marker state" — those must not red. The defect is narrower: the
    // capture-adr banner says "unconfirmed until ratified" and the drain
    // promotes the frontmatter without rewriting it. Machine-written, so it
    // cannot be dodged by backticking.
    const offenders = adrFiles.filter(
      (f) =>
        frontmatter(read(f), 'human-oversight') === 'confirmed' &&
        /human-oversight:\s*unconfirmed until ratified/.test(bodyOf(read(f))),
    );
    assert.deepStrictEqual(
      offenders,
      [],
      `capture-adr banner still says "unconfirmed until ratified" while the frontmatter says confirmed. ` +
        `The ratification drain must rewrite the banner. Offenders: ${offenders.join(', ')}`,
    );
  });

  it('no ADR describes another ADR as unconfirmed when that ADR is confirmed', () => {
    // The cross-file form. ADR-003 said "ADR 036 is proposed/human-oversight:
    // unconfirmed" for three weeks after ADR-036 was ratified. Intra-file
    // scoping misses this entirely, and a code span hides it from a naive scan.
    const oversight = new Map(
      adrFiles.map((f) => [idOf(f), frontmatter(read(f), 'human-oversight')]),
    );
    // RETAINED HISTORY IS NOT A CURRENT CLAIM, and this exemption was forced by
    // the rule ADR-049 establishes. Retain-as-history REQUIRES quoting the
    // superseded wording verbatim — so a correction made under that rule
    // deliberately reproduces the stale sentence, and a fence that cannot tell a
    // live claim from a quotation of a dead one fights every such correction.
    // Both records ratified in the 2026-08-18 drain hit this within minutes.
    //
    // SCOPED BY PROXIMITY, NOT BY LINE, and the first version got this wrong.
    // It required the marker on the same LINE, which sounded narrow and is not:
    // this corpus writes unwrapped markdown, so a "line" is a whole paragraph —
    // ADR-048's is 1,367 characters. Worse, it matched case-insensitively, so
    // the shouty sentinel spellings REPOINTED and AMENDED collapsed into the
    // ordinary English words "repointed" and "amended", which appear in narrative
    // prose here 2 and 5 times respectively. A live stale claim sharing a
    // paragraph with either would have been silently exempted.
    //
    // Retain-as-history reads "**Factual correction <date>**, retained per … the
    // wording was *\"<quote>\"*" — the marker immediately PRECEDES the quote. So
    // require it within a short window before the match, and require the sentinel
    // spellings to be literal.
    const RETAINED = /Factual correction|retained per|the wording was|superseded wording/;
    const WINDOW = 240;
    const wrong = [];
    for (const f of adrFiles) {
      const body = bodyOf(read(f));
      const claims = body.matchAll(
        /(ADR[\s-]0*(\d{3}))[^.\n]{0,80}?human-oversight:\s*`?unconfirmed/g,
      );
      for (const m of claims) {
        const id = m[2];
        if (RETAINED.test(body.slice(Math.max(0, m.index - WINDOW), m.index))) continue;
        const target = `ADR-${id.slice(-3)}`;
        if (oversight.get(target) === 'confirmed') {
          wrong.push(
            `${f} describes ${target} as unconfirmed; it is confirmed`,
          );
        }
      }
    }
    assert.deepStrictEqual(wrong, [], wrong.join('; '));
  });

  it('compendium status/oversight badges agree with the frontmatter they mirror', () => {
    // FAIL-OPEN DEFECT, found and fixed 2026-08-08. The previous pattern
    // anchored the oversight capture to end-of-line and excluded `|`, so any
    // entry carrying a THIRD badge field — `| **Supersedes:** ADR-NNN` or
    // `| **Superseded by:** …` — did not match, hit a silent `continue`, and
    // went unchecked. That was 6 of 43 entries: ADR-028, 036, 038, 039, 042,
    // 043. Five happened to agree; ADR-043 sat at badge `proposed` against
    // frontmatter `accepted` for the length of a promotion while this test
    // reported green.
    //
    // This file was written as the answer to P090 — hand-maintained governance
    // facts that nothing checks — and had become an instance of it. Two things
    // stop that recurring:
    //
    //   1. Presence is detected by the HEADING ALONE (`^### ADR-NNN\b`), and
    //      the badge line is parsed as a separate step. If presence were
    //      decided by the same regex that parses the badge, `unparsed` could
    //      never be non-empty and the split below would be decorative. The
    //      heading match deliberately does not require the em dash, so a
    //      heading-format change fails closed rather than vanishing.
    //   2. Both a missing entry and an unparseable one FAIL. All 43 ADRs
    //      currently have entries, so failing closed costs nothing today and
    //      catches the next ADR that lands without one.
    //
    // Badge values are read by splitting on `|` into `**Key:** value` pairs, so
    // field count and order are free. `**Decides:**` and `**Related:**` are
    // separate lines and are deliberately not folded in here.
    const compendium = read('README.md');
    const problems = [];
    for (const f of adrFiles) {
      const id = idOf(f);
      if (!new RegExp(String.raw`^### ${id}\b`, 'm').test(compendium)) {
        problems.push(
          `${id}: no compendium entry (ADR-077 makes it the architect's load surface)`,
        );
        continue;
      }
      const badgeLine = new RegExp(
        String.raw`^### ${id}\b[^\n]*\n+(\*\*Status:\*\*[^\n]*)$`,
        'm',
      ).exec(compendium);
      if (!badgeLine) {
        problems.push(
          `${id}: has an entry but its badge line did not parse — unchecked, which is the fail-open shape this test exists to catch`,
        );
        continue;
      }
      const badge = Object.fromEntries(
        badgeLine[1]
          .split('|')
          .map((part) => /^\*\*([\w -]+):\*\*\s*(.*)$/.exec(part.trim()))
          .filter(Boolean)
          .map((m) => [m[1].trim().toLowerCase(), m[2].trim()]),
      );
      const text = read(f);
      // Leading token only — badges carry annotations like "confirmed (2026-07-27)".
      const badgeStatus = badge.status?.split(/\s+/, 1)[0];
      const badgeOversight = badge.oversight?.split(/\s+/, 1)[0];
      const fileStatus = frontmatter(text, 'status');
      const fileOversight = frontmatter(text, 'human-oversight');

      if (badgeStatus !== fileStatus) {
        problems.push(`${id}: badge status ${badgeStatus}, file ${fileStatus}`);
      }
      // Present XOR present is a red; both absent passes. A "skip when the key
      // is absent" rule would fail open on ADR-013, whose badge asserts a marker
      // value its frontmatter does not carry.
      if (Boolean(badgeOversight) !== Boolean(fileOversight)) {
        problems.push(
          `${id}: oversight badge ${badgeOversight ?? '(none)'} vs frontmatter ${fileOversight ?? '(none)'} — one present, one absent`,
        );
      } else if (badgeOversight && badgeOversight !== fileOversight) {
        problems.push(
          `${id}: badge oversight ${badgeOversight}, file ${fileOversight}`,
        );
      }
    }
    assert.deepStrictEqual(problems, [], problems.join('; '));
  });

  it('every supersedes-clause target carries a reverse badge in the compendium', () => {
    // WHY THIS EXISTS. A clause-level supersession — one that retires a single
    // sentence rather than a whole ADR — cannot rename or restatus its parent,
    // so DECISION-MANAGEMENT.md's whole-ADR mechanics (rename to .superseded.md,
    // add a "Superseded by" note) do not apply. The only thing making the
    // relationship legible FROM THE SUPERSEDED END is a badge field on the
    // parent's compendium entry.
    //
    // That badge is a hand-edit in a file whose own header says AUTO-GENERATED,
    // do NOT hand-edit. The generator is documented-destructive, and it runs at
    // the review-decisions drain. So without this assertion the badge dies on
    // the next regeneration, silently, and a reader landing on the superseded
    // sentence has nothing pointing forward again — which is precisely the
    // defect ADR-047's confirmation criterion 4 was written to close, and was
    // itself false about until the badge was added.
    //
    // Derived from the frontmatter, not a hardcoded pair: the scalar
    // `supersedes-clause: <NNN>#<anchor>` on the SUPERSEDING ADR is the source
    // of truth, and it survives regeneration because the generator does not
    // rewrite ADR files. A new clause supersession is covered the moment it
    // declares the scalar; nothing needs updating here.
    const compendium = read('README.md');
    const problems = [];

    for (const f of adrFiles) {
      const clause = frontmatter(read(f), 'supersedes-clause');
      if (!clause) continue;

      const superseding = /^(\d{3})/.exec(f.replace(/^.*\//, ''))?.[1];
      const target = /^(\d{3})/.exec(clause)?.[1];
      if (!target) {
        problems.push(
          `${f}: supersedes-clause "${clause}" does not start with a 3-digit ADR id`,
        );
        continue;
      }
      if (!adrFiles.some((g) => g.replace(/^.*\//, '').startsWith(target))) {
        problems.push(`${f}: supersedes-clause targets ADR-${target}, which has no file`);
        continue;
      }

      const badgeLine = new RegExp(
        String.raw`^### ADR-${target}\b[^\n]*\n+(\*\*Status:\*\*[^\n]*)$`,
        'm',
      ).exec(compendium);
      if (!badgeLine) {
        problems.push(`ADR-${target}: no compendium badge line to carry the reverse reference`);
        continue;
      }
      if (!new RegExp(String.raw`Superseded in part by:\*\*[^|]*ADR-${superseding}\b`).test(badgeLine[1])) {
        problems.push(
          `ADR-${target}: ADR-${superseding} declares supersedes-clause "${clause}" but ADR-${target}'s badge carries no `
            + `"**Superseded in part by:** ADR-${superseding}" — the supersession is invisible from the superseded end`,
        );
      }
    }

    assert.deepStrictEqual(problems, [], problems.join('; '));
  });

  it('no compendium badge claims a supersession no ADR declares', () => {
    // THE SYMMETRIC HALF of the check above, and it exists because the asymmetry
    // bit within a day of the first one shipping. That check walks
    // scalar -> badge: every `supersedes-clause` must have a matching
    // `Superseded in part by:` reference. Nothing walked the other way, so a
    // badge left behind after its scalar is removed is an orphan no test sees —
    // a compendium asserting a supersession that no decision record makes.
    //
    // That is not hypothetical. ADR-048 was drafted as a clause supersession of
    // ADR-046, got its badge, and was then rewritten as a standalone decision on
    // review. The scalar went; the badge would have stayed, and the compendium —
    // which this file's header calls out as trusted precisely because it looks
    // derived — would have carried a false supersession indefinitely.
    const compendium = read('README.md');
    const declared = new Set();
    for (const f of adrFiles) {
      const clause = frontmatter(read(f), 'supersedes-clause');
      if (!clause) continue;
      const superseding = /^(\d{3})/.exec(f.replace(/^.*\//, ''))?.[1];
      const target = /^(\d{3})/.exec(clause)?.[1];
      if (superseding && target) declared.add(`${target}<-${superseding}`);
    }

    const problems = [];
    // Every badge claim in the compendium must be backed by a declared scalar.
    const badgeRe = /^### ADR-(\d{3})\b[^\n]*\n+(\*\*Status:\*\*[^\n]*)$/gm;
    for (const m of compendium.matchAll(badgeRe)) {
      const target = m[1];
      // ALL ids in the field, not just the first. The obvious form —
      // /Superseded in part by:\*\*[^|]*?ADR-(\d{3})/g — advances lastIndex past
      // the first id, then needs a second literal marker that is not there, so
      // `**Superseded in part by:** ADR-047, ADR-050` checks ADR-047 and lets
      // ADR-050 through unasserted. That fails OPEN, and it arises exactly when
      // a second clause supersession targets the same parent — which ADR-047's
      // own reassessment criteria anticipate. Isolate the field first, then scan
      // every id inside it.
      const field = /Superseded in part by:\*\*([^|]*)/.exec(m[2])?.[1] ?? '';
      for (const c of field.matchAll(/ADR-(\d{3})/g)) {
        if (!declared.has(`${target}<-${c[1]}`)) {
          problems.push(
            `ADR-${target}: compendium badge claims "Superseded in part by: ADR-${c[1]}", but ADR-${c[1]} `
              + 'declares no matching supersedes-clause — an orphaned badge asserting a supersession that no record makes',
          );
        }
      }
    }

    assert.deepStrictEqual(problems, [], problems.join('; '));
  });

  it('compendium count claims agree with the filesystem and with each other', () => {
    const compendium = read('README.md');
    const historical = adrFiles.filter((f) =>
      HISTORICAL.has(statusOf(f)),
    ).length;
    const total = adrFiles.length;
    const inForce = total - historical;

    const totalLine =
      /\*\*Total ADRs:\*\* (\d+) \((\d+) in-force, (\d+) historical\)/.exec(
        compendium,
      );
    assert.ok(totalLine, 'compendium must carry a Total ADRs line');
    const [claimedTotal, claimedInForce, claimedHistorical] = totalLine
      .slice(1, 4)
      .map(Number);

    assert.equal(
      claimedInForce + claimedHistorical,
      claimedTotal,
      'Total line is not internally consistent',
    );
    assert.deepStrictEqual(
      [claimedTotal, claimedInForce, claimedHistorical],
      [total, inForce, historical],
      'Total ADRs line disagrees with the filesystem',
    );
    // The section subheadings restate the same two numbers. Correcting the Total
    // and not the subheading is the exact 2026-08-07 failure.
    assert.deepStrictEqual(
      Array.from(compendium.matchAll(/^_(\d+) ADRs\./gm), (m) => Number(m[1])),
      [inForce, historical],
      'section subheading counts disagree with the filesystem or the Total line',
    );
  });

  it('every ADR-NNN in a compendium Related line resolves to a file', () => {
    // A phantom ADR-074 reached ADR-029's Related line, mis-derived from problem
    // ticket P074. Scoped to Related lines: the carve-out HTML comment names
    // ADR-074 while describing the defect, and must not red.
    //
    // LIMIT: resolution is not correctness. A token mis-derived from the
    // plugin's ADR namespace could resolve here and still be the wrong artefact.
    const known = new Set(adrFiles.map(idOf));
    const phantoms = new Set();
    const compendiumLines = read('README.md').split('\n');
    for (const line of compendiumLines) {
      if (!line.startsWith('**Related:**')) continue;
      const tokens = line.match(/ADR-\d{3}/g) ?? [];
      for (const token of tokens) {
        if (!known.has(token)) phantoms.add(token);
      }
    }
    assert.deepStrictEqual(
      [...phantoms],
      [],
      `Related lines name ADR ids with no file: ${[...phantoms].join(', ')}`,
    );
  });

  it('filename status suffix matches frontmatter status', () => {
    const split = adrFiles
      .map((f) => ({
        f,
        file: statusOf(f),
        front: frontmatter(read(f), 'status'),
      }))
      .filter(({ file, front }) => front && file !== front)
      .map(
        ({ f, file, front }) =>
          `${f}: filename says ${file}, frontmatter says ${front}`,
      );
    assert.deepStrictEqual(split, [], split.join('; '));
  });

  it('every filename status suffix is one of the five sanctioned values', () => {
    const bad = adrFiles
      .filter((f) => !SANCTIONED.has(statusOf(f)))
      .map((f) => `${f}: ${statusOf(f)}`);
    assert.deepStrictEqual(bad, [], bad.join('; '));
  });
});
