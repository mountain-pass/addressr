#!/usr/bin/env node
// P010 guardrail — fail if any `@not-cli2` tag in a cucumber feature lacks
// a `docs/problems/NNN-` cross-reference in a nearby comment.
//
// Invoked from package.json as `check:not-cli2-tags` and chained into
// `npm run pre-commit`. Serves JTBD J7.

import { readFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';

const TAG_PATTERN = /(^|\s)@not-cli2(\s|$)/;
// A line is only a P010-style offender if it tags @not-cli2 WITHOUT also
// tagging @not-cli. The combined @not-cli @not-cli2 pattern reflects a
// broader, deliberate profile-specific skip (e.g. CORS tests that only
// run in the rest HTTP profile) — that is architectural, not the P010
// env-mutation regression this guardrail targets.
const NON_CLI2_CLI_PATTERN = /(^|\s)@not-cli(\s|$)/;
const REFERENCE_PATTERN = /docs\/problems\/\d{3}-/;

async function findFeatureFiles() {
  const files = [];
  for await (const file of glob('test/**/*.feature')) {
    files.push(file);
  }
  return files;
}

function lineNumbersWithTag(content) {
  const hits = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!TAG_PATTERN.test(line)) continue;
    if (NON_CLI2_CLI_PATTERN.test(line)) continue;
    hits.push({ line: i + 1, text: line.trim() });
  }
  return hits;
}

const files = await findFeatureFiles();
const offenders = [];

for (const file of files) {
  const content = await readFile(file, 'utf8');
  const tagLines = lineNumbersWithTag(content);
  if (tagLines.length === 0) continue;
  if (REFERENCE_PATTERN.test(content)) continue;
  offenders.push({ file, tagLines });
}

if (offenders.length === 0) {
  process.exit(0);
}

const totalTags = offenders.reduce((n, o) => n + o.tagLines.length, 0);
console.error(
  `\ncheck-not-cli2-tags: ${totalTags} @not-cli2 tag(s) in ${offenders.length} feature file(s) lack a docs/problems/NNN- reference anywhere in the file.\n`,
);
for (const o of offenders) {
  console.error(`  ${o.file}:`);
  for (const t of o.tagLines) console.error(`    line ${t.line}: ${t.text}`);
}
console.error(
  '\nAdd a comment like `# See docs/problems/010-cli2-cucumber-cannot-mutate-origin-env.open.md` somewhere in the feature file (Feature description is fine) to justify the exemption.\n',
);
process.exit(1);
