import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

function startUnsubscribedMockApi() {
  // Simulates the silent-degradation case from P012: upstream returns a valid
  // 4xx JSON error body (no _links, no Link header). fetchLink() resolves
  // successfully and root.links() returns [], which would silently degrade
  // tool registration without the diagnostic guard.
  return new Promise((resolve) => {
    const server = createHttpServer((req, res) => {
      if (req.url === '/' || req.url.startsWith('/?_rapidapi-cache-bust=')) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'You are not subscribed to this API.' }));
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Not found' }));
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, url: `http://127.0.0.1:${addr.port}/` });
    });
  });
}

function startMockApi() {
  return new Promise((resolve) => {
    const server = createHttpServer((req, res) => {
      if (req.url === '/' || req.url === '/?_rapidapi-cache-bust=1') {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          Link: [
            '</addresses?q={q}>; rel="https://addressr.io/rels/address-search"',
            '</localities?q={q}>; rel="https://addressr.io/rels/locality-search"',
            '</postcodes?q={q}>; rel="https://addressr.io/rels/postcode-search"',
            '</states?q={q}>; rel="https://addressr.io/rels/state-search"',
            '</health>; rel="https://addressr.io/rels/health"',
          ].join(', '),
        });
        res.end(JSON.stringify({}));
        return;
      }
      if (req.url === '/localities/test-pid') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ pid: 'test-pid', name: 'Test Locality' }));
        return;
      }
      if (req.url === '/postcodes/2000') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ postcode: '2000', localities: [{ name: 'Sydney' }] }));
        return;
      }
      if (req.url === '/states/NSW') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ name: 'New South Wales', abbreviation: 'NSW' }));
        return;
      }
      if (req.url === '/addresses/test-pid') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ pid: 'test-pid', sla: '1 Test St, Testville NSW 2000' }));
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'application/json',
        Link: '</results/test-pid>; rel=canonical; anchor="#/0", </results?page=2>; rel=next',
      });
      res.end(JSON.stringify([{ pid: 'test-pid', name: 'Test' }]));
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, url: `http://127.0.0.1:${addr.port}/` });
    });
  });
}

describe('dynamic tool registration', () => {
  it('exports a REL_TO_TOOL mapping for known link relations', async () => {
    const source = await readFile('src/server.mjs', 'utf8');
    assert.ok(source.includes('REL_TO_TOOL'), 'REL_TO_TOOL mapping should exist in source');
    assert.ok(
      source.includes('https://addressr.io/rels/locality-search'),
      'locality-search rel should be mapped',
    );
    assert.ok(
      source.includes('https://addressr.io/rels/postcode-search'),
      'postcode-search rel should be mapped',
    );
    assert.ok(
      source.includes('https://addressr.io/rels/state-search'),
      'state-search rel should be mapped',
    );
  });

  it('accepts ADDRESSR_RAPIDAPI_KEY as fallback for RAPIDAPI_KEY', async () => {
    const mockApi = await startMockApi();

    const client = new Client({ name: 'addressr-mcp-test', version: '1.0.0' });
    const transport = new StdioClientTransport({
      command: 'node',
      args: ['src/server.mjs'],
      env: {
        ...process.env,
        RAPIDAPI_KEY: undefined,
        ADDRESSR_RAPIDAPI_KEY: 'dummy',
        ADDRESSR_API_URL: mockApi.url,
        ADDRESSR_API_HOST: 'addressr.p.rapidapi.com',
      },
    });

    await client.connect(transport);

    try {
      const { tools } = await client.listTools();
      const toolNames = tools.map((t) => t.name);
      assert.ok(toolNames.includes('health'), 'Server should start with ADDRESSR_RAPIDAPI_KEY');
      assert.ok(toolNames.includes('get-address'), 'Server should register get-address with ADDRESSR_RAPIDAPI_KEY');
    } finally {
      await client.close();
      transport.close();
      mockApi.server.close();
    }
  });

  it('surfaces upstream cause when API root returns 4xx + JSON error body (P012)', async () => {
    const mockApi = await startUnsubscribedMockApi();

    const client = new Client({ name: 'addressr-mcp-test', version: '1.0.0' });
    const transport = new StdioClientTransport({
      command: 'node',
      args: ['src/server.mjs'],
      env: {
        ...process.env,
        RAPIDAPI_KEY: 'dummy',
        ADDRESSR_API_URL: mockApi.url,
        ADDRESSR_API_HOST: 'addressr.p.rapidapi.com',
      },
      stderr: 'pipe',
    });

    const stderrChunks = [];
    transport.stderr?.on('data', (chunk) => {
      stderrChunks.push(chunk.toString());
    });

    await client.connect(transport);

    try {
      const { tools } = await client.listTools();
      const toolNames = tools.map((t) => t.name);

      assert.ok(toolNames.includes('health'), 'Should still register health on upstream 4xx');
      assert.ok(
        toolNames.includes('get-address'),
        'Should still register get-address on upstream 4xx',
      );
      assert.ok(
        !toolNames.includes('search-addresses'),
        'Should NOT register search-addresses when upstream advertises no rels',
      );

      // Let stderr buffer flush
      await new Promise((resolve) => setTimeout(resolve, 200));
      const stderr = stderrChunks.join('');
      assert.match(
        stderr,
        /RAPIDAPI_KEY/,
        `Diagnostic warning should name RAPIDAPI_KEY. Got stderr: ${stderr}`,
      );
      assert.match(
        stderr,
        /subscription/i,
        `Diagnostic warning should mention subscription state. Got stderr: ${stderr}`,
      );
    } finally {
      await client.close();
      transport.close();
      mockApi.server.close();
    }
  });

  it('falls back to health and get-address when API root is unreachable', async () => {
    const mockApi = await startMockApi();
    mockApi.server.close();

    const client = new Client({ name: 'addressr-mcp-test', version: '1.0.0' });
    const transport = new StdioClientTransport({
      command: 'node',
      args: ['src/server.mjs'],
      env: {
        ...process.env,
        RAPIDAPI_KEY: 'dummy',
        ADDRESSR_API_URL: mockApi.url,
        ADDRESSR_API_HOST: 'addressr.p.rapidapi.com',
      },
    });

    await client.connect(transport);

    try {
      const { tools } = await client.listTools();
      const toolNames = tools.map((t) => t.name);

      assert.ok(toolNames.includes('health'), 'Should always register health tool');
      assert.ok(toolNames.includes('get-address'), 'Should always register get-address tool');
      assert.ok(
        !toolNames.includes('search-localities'),
        'Should NOT register search-localities when API is down',
      );
    } finally {
      await client.close();
      transport.close();
    }
  });

  it('dynamically registers tools based on API root link relations', async () => {
    const mockApi = await startMockApi();

    const client = new Client({ name: 'addressr-mcp-test', version: '1.0.0' });
    const transport = new StdioClientTransport({
      command: 'node',
      args: ['src/server.mjs'],
      env: {
        ...process.env,
        RAPIDAPI_KEY: 'dummy',
        ADDRESSR_API_URL: mockApi.url,
        ADDRESSR_API_HOST: 'addressr.p.rapidapi.com',
      },
    });

    await client.connect(transport);

    try {
      const { tools } = await client.listTools();
      const toolNames = tools.map((t) => t.name);

      assert.ok(
        toolNames.includes('search-localities'),
        'Should register search-localities tool',
      );
      assert.ok(
        toolNames.includes('search-postcodes'),
        'Should register search-postcodes tool',
      );
      assert.ok(
        toolNames.includes('search-states'),
        'Should register search-states tool',
      );
    } finally {
      await client.close();
      transport.close();
      mockApi.server.close();
    }
  });

  it('search results include status, headers, and body envelope', async () => {
    const mockApi = await startMockApi();

    const client = new Client({ name: 'addressr-mcp-test', version: '1.0.0' });
    const transport = new StdioClientTransport({
      command: 'node',
      args: ['src/server.mjs'],
      env: {
        ...process.env,
        RAPIDAPI_KEY: 'dummy',
        ADDRESSR_API_URL: mockApi.url,
        ADDRESSR_API_HOST: 'addressr.p.rapidapi.com',
      },
    });

    await client.connect(transport);

    try {
      const result = await client.callTool({
        name: 'search-addresses',
        arguments: { q: 'test' },
      });
      const text = result.content.find((c) => c.type === 'text')?.text;
      assert.ok(text, 'Should return text content');
      const envelope = JSON.parse(text);
      assert.strictEqual(envelope.status, 200, 'Should have status 200');
      assert.ok(envelope.headers, 'Should have headers');
      assert.ok(Array.isArray(envelope.body), 'Body should be an array');
    } finally {
      await client.close();
      transport.close();
      mockApi.server.close();
    }
  });

  it('get-address accepts url parameter and returns envelope', async () => {
    const mockApi = await startMockApi();

    const client = new Client({ name: 'addressr-mcp-test', version: '1.0.0' });
    const transport = new StdioClientTransport({
      command: 'node',
      args: ['src/server.mjs'],
      env: {
        ...process.env,
        RAPIDAPI_KEY: 'dummy',
        ADDRESSR_API_URL: mockApi.url,
        ADDRESSR_API_HOST: 'addressr.p.rapidapi.com',
      },
    });

    await client.connect(transport);

    try {
      const result = await client.callTool({
        name: 'get-address',
        arguments: { url: `${mockApi.url}addresses/test-pid` },
      });
      const text = result.content.find((c) => c.type === 'text')?.text;
      assert.ok(text, 'Should return text content');
      const envelope = JSON.parse(text);
      assert.strictEqual(envelope.status, 200, 'Envelope should have status 200');
      assert.ok(envelope.headers, 'Envelope should have headers');
      assert.ok(envelope.body, 'Envelope should have body');
      assert.strictEqual(envelope.body.pid, 'test-pid');
    } finally {
      await client.close();
      transport.close();
      mockApi.server.close();
    }
  });

  it('get-locality accepts url parameter and returns envelope', async () => {
    const mockApi = await startMockApi();

    const client = new Client({ name: 'addressr-mcp-test', version: '1.0.0' });
    const transport = new StdioClientTransport({
      command: 'node',
      args: ['src/server.mjs'],
      env: {
        ...process.env,
        RAPIDAPI_KEY: 'dummy',
        ADDRESSR_API_URL: mockApi.url,
        ADDRESSR_API_HOST: 'addressr.p.rapidapi.com',
      },
    });

    await client.connect(transport);

    try {
      const result = await client.callTool({
        name: 'get-locality',
        arguments: { url: `${mockApi.url}localities/test-pid` },
      });
      const text = result.content.find((c) => c.type === 'text')?.text;
      assert.ok(text, 'Should return text content');
      const envelope = JSON.parse(text);
      assert.strictEqual(envelope.status, 200);
      assert.strictEqual(envelope.body.name, 'Test Locality');
    } finally {
      await client.close();
      transport.close();
      mockApi.server.close();
    }
  });

  it('get-postcode accepts url parameter and returns envelope', async () => {
    const mockApi = await startMockApi();

    const client = new Client({ name: 'addressr-mcp-test', version: '1.0.0' });
    const transport = new StdioClientTransport({
      command: 'node',
      args: ['src/server.mjs'],
      env: {
        ...process.env,
        RAPIDAPI_KEY: 'dummy',
        ADDRESSR_API_URL: mockApi.url,
        ADDRESSR_API_HOST: 'addressr.p.rapidapi.com',
      },
    });

    await client.connect(transport);

    try {
      const result = await client.callTool({
        name: 'get-postcode',
        arguments: { url: `${mockApi.url}postcodes/2000` },
      });
      const text = result.content.find((c) => c.type === 'text')?.text;
      assert.ok(text, 'Should return text content');
      const envelope = JSON.parse(text);
      assert.strictEqual(envelope.status, 200);
      assert.strictEqual(envelope.body.postcode, '2000');
    } finally {
      await client.close();
      transport.close();
      mockApi.server.close();
    }
  });

  it('search results include parsed _links array', async () => {
    const mockApi = await startMockApi();

    const client = new Client({ name: 'addressr-mcp-test', version: '1.0.0' });
    const transport = new StdioClientTransport({
      command: 'node',
      args: ['src/server.mjs'],
      env: {
        ...process.env,
        RAPIDAPI_KEY: 'dummy',
        ADDRESSR_API_URL: mockApi.url,
        ADDRESSR_API_HOST: 'addressr.p.rapidapi.com',
      },
    });

    await client.connect(transport);

    try {
      const result = await client.callTool({
        name: 'search-addresses',
        arguments: { q: 'test' },
      });
      const text = result.content.find((c) => c.type === 'text')?.text;
      assert.ok(text, 'Should return text content');
      const envelope = JSON.parse(text);
      assert.ok(Array.isArray(envelope.headers.link), 'headers.link should be a parsed array');
      assert.strictEqual(envelope.headers.link.length, 2, 'Should have 2 links');
      const canonical = envelope.headers.link.find((l) => l.rel === 'canonical');
      assert.ok(canonical, 'Should have canonical link');
      assert.ok(canonical.uri, 'Canonical link should have uri');
      assert.strictEqual(canonical.anchor, '#/0');
      const next = envelope.headers.link.find((l) => l.rel === 'next');
      assert.ok(next, 'Should have next link');
    } finally {
      await client.close();
      transport.close();
      mockApi.server.close();
    }
  });

  it('get-state accepts url parameter and returns envelope', async () => {
    const mockApi = await startMockApi();

    const client = new Client({ name: 'addressr-mcp-test', version: '1.0.0' });
    const transport = new StdioClientTransport({
      command: 'node',
      args: ['src/server.mjs'],
      env: {
        ...process.env,
        RAPIDAPI_KEY: 'dummy',
        ADDRESSR_API_URL: mockApi.url,
        ADDRESSR_API_HOST: 'addressr.p.rapidapi.com',
      },
    });

    await client.connect(transport);

    try {
      const result = await client.callTool({
        name: 'get-state',
        arguments: { url: `${mockApi.url}states/NSW` },
      });
      const text = result.content.find((c) => c.type === 'text')?.text;
      assert.ok(text, 'Should return text content');
      const envelope = JSON.parse(text);
      assert.strictEqual(envelope.status, 200);
      assert.strictEqual(envelope.body.name, 'New South Wales');
    } finally {
      await client.close();
      transport.close();
      mockApi.server.close();
    }
  });
});
