import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ADR 026: OpenSearch index mapping must declare `sla_range_expanded` as a
// text field analysed by `my_analyzer`, mirroring the sla / ssla declaration
// shape but without a `.raw` sub-field (we never sort on sla_range_expanded).
// Multi-value is implicit — OpenSearch treats an array as multiple values of
// the same text field with position_increment_gap between elements.
describe('client/elasticsearch.js — sla_range_expanded mapping (ADR 026)', () => {
  it('declares sla_range_expanded under mappings.properties', async () => {
    const source = await readFile(
      path.resolve(__dirname, '../../../client/elasticsearch.js'),
      'utf8',
    );
    assert.match(
      source,
      /sla_range_expanded\s*:\s*\{/,
      'client/elasticsearch.js must declare a mapping entry for sla_range_expanded per ADR 026',
    );
  });

  it('declares sla_range_expanded as a text field with my_analyzer', async () => {
    const source = await readFile(
      path.resolve(__dirname, '../../../client/elasticsearch.js'),
      'utf8',
    );
    const declBlock = source.match(
      /sla_range_expanded\s*:\s*\{([\s\S]*?)\}/,
    );
    assert.notEqual(
      declBlock,
      null,
      'sla_range_expanded declaration block must be parseable',
    );
    assert.match(
      declBlock[1],
      /type\s*:\s*['"]text['"]/,
      'sla_range_expanded must be declared with type: "text"',
    );
    assert.match(
      declBlock[1],
      /analyzer\s*:\s*['"]my_analyzer['"]/,
      'sla_range_expanded must use the same my_analyzer as sla/ssla',
    );
  });
});
