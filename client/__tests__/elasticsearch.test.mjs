/* eslint-disable @eslint-community/eslint-comments/disable-enable-pair */
/* eslint-disable unicorn/prevent-abbreviations */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// P036 sibling structural guard: asserts that the loader imports the shared
// buildClientNode helper rather than reconstructing the node URL inline.
// Behavioural coverage of the helper itself lives in
// test/js/__tests__/client-node-url.test.mjs.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const loaderPath = path.resolve(__dirname, '..', 'elasticsearch.js');

describe('client/elasticsearch.js — buildClientNode dedup (P036)', () => {
  it('imports buildClientNode from the shared helper', async () => {
    const source = await readFile(loaderPath, 'utf8');
    assert.match(
      source,
      /import\s+\{[^}]*buildClientNode[^}]*\}\s+from\s+['"][^'"]*client-node-url(\.js)?['"]/,
      'client/elasticsearch.js must import buildClientNode from ../src/client-node-url',
    );
  });

  it('does NOT reconstruct the node URL inline (drift guard)', async () => {
    const source = await readFile(loaderPath, 'utf8');
    // The bug-shape we never want back: `${PROTO}://${USER}:${PASS}@${HOST}:${PORT}`
    // without encodeURIComponent. Match a literal template that puts unencoded
    // ELASTIC_USERNAME and ELASTIC_PASSWORD into the URL.
    const inlineBugPattern =
      /\$\{ELASTIC_PROTOCOL\}:\/\/\$\{ELASTIC_USERNAME\}:\$\{ELASTIC_PASSWORD\}@/;
    assert.doesNotMatch(
      source,
      inlineBugPattern,
      'client/elasticsearch.js must not reconstruct the node URL inline — use buildClientNode',
    );
  });
});
