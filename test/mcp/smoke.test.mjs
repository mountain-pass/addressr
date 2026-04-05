import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createMcpClient, hasRapidApiKey } from './mcp-client.mjs';

// Load .env if present (safe to fail)
try { await import('dotenv/config'); } catch {}

describe('MCP Smoke Tests', { skip: !hasRapidApiKey() && 'RAPIDAPI_KEY not set' }, () => {
  let client;

  before(async () => {
    client = await createMcpClient();
  });

  after(async () => {
    if (client) {
      await client.close();
    }
  });

  it('connects to RapidAPI MCP server', () => {
    assert.ok(client, 'Client should be connected');
  });

  it('lists tools including addressr endpoints', async () => {
    const { tools } = await client.listTools();
    assert.ok(tools.length >= 3, `Expected at least 3 tools, got ${tools.length}`);

    const toolNames = tools.map(t => t.name);
    console.log('Available MCP tools:', toolNames);

    // RapidAPI auto-generates these tool names from the API spec:
    // - "addresses" (GET /addresses?q=...)
    // - "addressesaddressId" (GET /addresses/{addressId})
    // - "unnamed_tool" (GET /)
    assert.ok(
      toolNames.includes('addresses'),
      `Expected 'addresses' tool. Found: ${toolNames.join(', ')}`,
    );
    assert.ok(
      toolNames.includes('addressesaddressId'),
      `Expected 'addressesaddressId' tool. Found: ${toolNames.join(', ')}`,
    );
  });

  it('searches for addresses', async () => {
    const result = await client.callTool({
      name: 'addresses',
      arguments: { q: '1 george st sydney' },
    });

    assert.ok(result, 'Should get a result');
    assert.ok(result.content, 'Result should have content');

    const textContent = result.content.find(c => c.type === 'text');
    assert.ok(textContent, 'Should have text content');

    console.log('Search result (first 500 chars):', textContent.text.slice(0, 500));

    const parsed = JSON.parse(textContent.text);
    const results = Array.isArray(parsed) ? parsed : parsed.results || parsed.addresses || [parsed];
    assert.ok(results.length > 0, 'Search should return results');
  });

  it('retrieves address details', async () => {
    // First search to get a PID
    const searchResult = await client.callTool({
      name: 'addresses',
      arguments: { q: '1 george st sydney' },
    });
    const searchText = searchResult.content.find(c => c.type === 'text').text;
    const searchData = JSON.parse(searchText);
    const results = Array.isArray(searchData)
      ? searchData
      : searchData.results || searchData.addresses || [searchData];

    assert.ok(results.length > 0, 'Need search results to test detail retrieval');

    // Extract a PID from search results
    const firstResult = results[0];
    const pid = firstResult.pid || firstResult.id || firstResult.addressId;
    assert.ok(pid, `Expected pid in search result. Keys: ${Object.keys(firstResult).join(', ')}`);

    console.log('Fetching detail for PID:', pid);

    const detailResult = await client.callTool({
      name: 'addressesaddressId',
      arguments: { addressId: pid },
    });
    assert.ok(detailResult.content, 'Detail should have content');

    const detailText = detailResult.content.find(c => c.type === 'text')?.text;
    assert.ok(detailText, 'Detail should have text content');
    console.log('Detail result (first 500 chars):', detailText.slice(0, 500));
  });
});
