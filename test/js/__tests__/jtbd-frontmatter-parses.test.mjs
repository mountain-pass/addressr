// @jtbd JTBD-403 (Know the paid channel still bills correctly)
// @jtbd JTBD-400 (Ship releases reliably from trunk)
//
// Every job and persona file's frontmatter must be parseable YAML.
//
// This is a SILENT class, which is the only reason it needs a test. The
// ratification predicate that gates work on these files greps for a marker line;
// it never parses the block, so it returns "ratified" for a file whose frontmatter
// no parser can read. On 2026-09-06 both JTBD-403 and JTBD-005 sat unparseable
// while every gate that consults them passed, and the breakage was found by a
// reviewer rather than by anything in the repository.
//
// The mechanism is mundane and will recur: a bare apostrophe inside a
// single-quoted YAML scalar terminates the scalar. `this job's ratification`
// breaks; `this job''s ratification` does not. The screens entries are long
// single-quoted English prose, so possessives are constant and the failure is
// invisible in a diff — the line still reads correctly to a human.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';

const jtbdDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../docs/jtbd',
);

function markdownFilesUnder(directory) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) found.push(...markdownFilesUnder(full));
    else if (entry.endsWith('.md')) found.push(full);
  }
  return found;
}

describe('docs/jtbd — frontmatter is machine-readable', () => {
  const withFrontmatter = markdownFilesUnder(jtbdDir).filter((file) =>
    readFileSync(file, 'utf8').startsWith('---'),
  );

  it('finds frontmatter to parse, so a zero-match pass is impossible', () => {
    assert.ok(
      withFrontmatter.length >= 5,
      `expected at least 5 jtbd files carrying frontmatter, found ${withFrontmatter.length}`,
    );
  });

  it('parses every one of them', () => {
    const failures = [];
    for (const file of withFrontmatter) {
      const source = readFileSync(file, 'utf8');
      const end = source.indexOf('\n---', 3);
      if (end === -1) {
        failures.push(`${path.basename(file)}: frontmatter is never closed`);
        continue;
      }
      try {
        yaml.load(source.slice(3, end));
      } catch (error) {
        failures.push(
          `${path.basename(file)}: ${String(error.message).split('\n')[0]}`,
        );
      }
    }
    assert.deepStrictEqual(
      failures,
      [],
      'unparseable frontmatter — the commonest cause is a bare apostrophe ' +
        "inside a single-quoted scalar, which ends it; double it (job''s):\n" +
        failures.join('\n'),
    );
  });
});
