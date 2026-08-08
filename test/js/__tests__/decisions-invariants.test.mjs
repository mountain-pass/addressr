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
    const wrong = [];
    for (const f of adrFiles) {
      const claims = bodyOf(read(f)).matchAll(
        /(ADR[\s-]0*(\d{3}))[^.\n]{0,80}?human-oversight:\s*`?unconfirmed/g,
      );
      for (const [, id] of claims) {
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
        problems.push(`${id}: no compendium entry (ADR-077 makes it the architect's load surface)`);
        continue;
      }
      const badgeLine = new RegExp(
        String.raw`^### ${id}\b[^\n]*\n+(\*\*Status:\*\*[^\n]*)$`,
        'm',
      ).exec(compendium);
      if (!badgeLine) {
        problems.push(`${id}: has an entry but its badge line did not parse — unchecked, which is the fail-open shape this test exists to catch`);
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
