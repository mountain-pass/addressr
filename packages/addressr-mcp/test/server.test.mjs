import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { parseEnvelopeOrExplain } from './helpers/parse-envelope.mjs';

// Load .env if present so RAPIDAPI_KEY can be hydrated locally per ADR-005
try {
  await import('dotenv/config');
} catch {
  /* dotenv optional */
}

function hasKey() {
  return Boolean(
    process.env.RAPIDAPI_KEY || process.env.ADDRESSR_RAPIDAPI_KEY,
  );
}

async function createTestClient() {
  const client = new Client({
    name: 'addressr-mcp-test',
    version: '1.0.0',
  });
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['src/server.mjs'],
    env: {
      ...process.env,
    },
  });
  await client.connect(transport);
  return { client, transport };
}

describe(
  'addressr-mcp local server (live RapidAPI)',
  { skip: !hasKey() && 'RAPIDAPI_KEY not set' },
  () => {
    let client;
    let transport;

    before(async () => {
      ({ client, transport } = await createTestClient());
    });

    after(async () => {
      if (client) await client.close();
      if (transport) transport.close();
    });

    it('lists kebab-case addressr tools', async () => {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name);

      const expected = [
        'search-addresses',
        'get-address',
        'search-localities',
        'get-locality',
        'search-postcodes',
        'get-postcode',
        'search-states',
        'get-state',
        'health',
      ];
      for (const name of expected) {
        assert.ok(
          names.includes(name),
          `Expected tool '${name}' in ${JSON.stringify(names)}`,
        );
      }
    });

    it('searches for addresses and returns {status, headers, body} envelope', async () => {
      const result = await client.callTool({
        name: 'search-addresses',
        arguments: { q: '1 george st sydney' },
      });
      const text = result.content.find((c) => c.type === 'text')?.text;
      assert.ok(text, 'Should have text content');

      const envelope = parseEnvelopeOrExplain(text, 'search-addresses');
      assert.strictEqual(typeof envelope.status, 'number', 'envelope.status should be a number');
      // P007: surface upstream status verbatim so CI red runs name the API state, not the SDK's JSON-parse stack.
      if (envelope.status !== 200) {
        throw new Error(
          `Expected 200 from upstream search-addresses but got ${envelope.status}: ${JSON.stringify(envelope.body)}`,
        );
      }
      assert.ok(envelope.headers && typeof envelope.headers === 'object', 'envelope.headers should be an object');
      assert.ok(envelope.body, 'envelope.body should be present');

      const results = Array.isArray(envelope.body) ? envelope.body : [envelope.body];
      assert.ok(results.length > 0, 'Should return at least one result');
      assert.ok(
        results[0].sla || results[0].pid,
        'Results should carry standard address fields (sla or pid)',
      );
    });

    it('retrieves address details via get-address with a canonical URL', async () => {
      const searchResult = await client.callTool({
        name: 'search-addresses',
        arguments: { q: '1 george st sydney' },
      });
      const searchEnvelope = parseEnvelopeOrExplain(
        searchResult.content.find((c) => c.type === 'text').text,
        'search-addresses',
      );
      // P007: surface upstream status verbatim so CI red runs name the API state, not the SDK's JSON-parse stack.
      if (searchEnvelope.status !== 200) {
        throw new Error(
          `Expected 200 from upstream search-addresses but got ${searchEnvelope.status}: ${JSON.stringify(searchEnvelope.body)}`,
        );
      }
      const results = Array.isArray(searchEnvelope.body)
        ? searchEnvelope.body
        : [searchEnvelope.body];
      const pid = results[0]?.pid;
      assert.ok(pid, 'Need a PID from search results');

      const apiHost = process.env.RAPIDAPI_HOST || 'addressr.p.rapidapi.com';
      const url = `https://${apiHost}/addresses/${encodeURIComponent(pid)}`;

      const detailResult = await client.callTool({
        name: 'get-address',
        arguments: { url },
      });
      const detailText = detailResult.content.find((c) => c.type === 'text')?.text;
      assert.ok(detailText, 'Should have detail content');

      const detailEnvelope = parseEnvelopeOrExplain(detailText, 'get-address');
      // P007: surface upstream status verbatim so CI red runs name the API state, not the SDK's JSON-parse stack.
      if (detailEnvelope.status !== 200) {
        throw new Error(
          `Expected 200 from upstream get-address but got ${detailEnvelope.status}: ${JSON.stringify(detailEnvelope.body)}`,
        );
      }
      assert.ok(detailEnvelope.headers, 'detail envelope should have headers');
      assert.ok(detailEnvelope.body, 'detail envelope should have body');
    });

    it('reports health via the health tool', async () => {
      const result = await client.callTool({
        name: 'health',
        arguments: {},
      });
      const text = result.content.find((c) => c.type === 'text')?.text;
      assert.ok(text, 'Should have text content');
      const envelope = parseEnvelopeOrExplain(text, 'health');
      assert.strictEqual(typeof envelope.status, 'number', 'health envelope.status should be a number');
      assert.ok(envelope.body, 'health envelope.body should be present');
    });
  },
);
