import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEnvelopeOrExplain } from './helpers/parse-envelope.mjs';

test('parseEnvelopeOrExplain parses a valid JSON envelope', () => {
  const env = parseEnvelopeOrExplain('{"status":200,"body":[]}', 'search-addresses');
  assert.equal(env.status, 200);
  assert.ok(Array.isArray(env.body));
});

test('parseEnvelopeOrExplain parses a JSON array envelope', () => {
  const env = parseEnvelopeOrExplain('[1,2,3]', 'search-addresses');
  assert.deepEqual(env, [1, 2, 3]);
});

test('parseEnvelopeOrExplain names the cause when the tool is unregistered (MCP error string, P017)', () => {
  assert.throws(
    () => parseEnvelopeOrExplain('MCP error -32602: Tool search-addresses not found', 'search-addresses'),
    (err) => {
      assert.ok(/not registered/i.test(err.message), 'message should say the tool is not registered');
      assert.ok(/RAPIDAPI_KEY/.test(err.message), 'message should name RAPIDAPI_KEY as the likely cause');
      assert.ok(/search-addresses/.test(err.message), 'message should name the tool');
      assert.ok(!/Unexpected token/.test(err.message), 'message must NOT be the cryptic JSON-parse stack');
      return true;
    },
  );
});

test('parseEnvelopeOrExplain handles empty / nullish text without a cryptic stack', () => {
  assert.throws(
    () => parseEnvelopeOrExplain('', 'health'),
    (err) => {
      assert.ok(/not registered/i.test(err.message) || /did not return/i.test(err.message));
      assert.ok(!/Unexpected token/.test(err.message));
      return true;
    },
  );
});
