import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const MCP_URL = process.env.MCP_URL || 'https://mcp.rapidapi.com';
const API_HOST = process.env.RAPIDAPI_HOST || 'addressr.p.rapidapi.com';

export function hasRapidApiKey() {
  return Boolean(process.env.RAPIDAPI_KEY);
}

export async function createMcpClient() {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) {
    throw new Error('RAPIDAPI_KEY environment variable is required');
  }

  // RapidAPI MCP uses x-api-key and x-api-host (not x-rapidapi-*)
  const headers = {
    'x-api-key': key,
    'x-api-host': API_HOST,
  };

  const client = new Client({
    name: 'addressr-mcp-smoke-test',
    version: '1.0.0',
  });

  // Try StreamableHTTP first, fall back to SSE
  try {
    const transport = new StreamableHTTPClientTransport(
      new URL(MCP_URL),
      { requestInit: { headers } },
    );
    await client.connect(transport);
    return client;
  } catch {
    const transport = new SSEClientTransport(
      new URL(MCP_URL),
      { requestInit: { headers } },
    );
    await client.connect(transport);
    return client;
  }
}
