import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { glowUpFetchWithLinks } from '@windyroad/fetch-link';
import { LinkHeader } from '@windyroad/link-header';
import { z } from 'zod';

const API_URL =
  process.env.ADDRESSR_API_URL || 'https://addressr.p.rapidapi.com/';
const API_HOST = process.env.RAPIDAPI_HOST || 'addressr.p.rapidapi.com';

const SEARCH_REL = 'https://addressr.io/rels/address-search';
const POSTCODE_SEARCH_REL = 'https://addressr.io/rels/postcode-search';
const LOCALITY_SEARCH_REL = 'https://addressr.io/rels/locality-search';
const STATE_SEARCH_REL = 'https://addressr.io/rels/state-search';
const HEALTH_REL = 'https://addressr.io/rels/health';

export const REL_TO_TOOL = {
  [SEARCH_REL]: {
    name: 'search-addresses',
    description:
      'Search Australian addresses by street, suburb, or postcode. Returns up to 8 results per page with standard address format, relevance score, and property ID (PID). Data sourced from the Geocoded National Address File (G-NAF).',
    schema: {
      q: z
        .string()
        .describe(
          'Australian address search query (min 3 chars). e.g. "1 george st sydney", "2000", "pyrmont nsw"',
        ),
      page: z
        .number()
        .optional()
        .describe('Page number for paginated results (default: first page)'),
    },
  },
  [POSTCODE_SEARCH_REL]: {
    name: 'search-postcodes',
    description:
      'Search Australian postcodes by partial text or number. Returns matching postcodes and their associated localities.',
    schema: {
      q: z
        .string()
        .describe(
          'Australian postcode search query. e.g. "2000", "200", "sydney"',
        ),
      page: z
        .number()
        .optional()
        .describe('Page number for paginated results (default: first page)'),
    },
  },
  [LOCALITY_SEARCH_REL]: {
    name: 'search-localities',
    description:
      'Search Australian localities (suburbs) by name. Returns matching localities with state and postcode.',
    schema: {
      q: z
        .string()
        .describe(
          'Australian locality search query. e.g. "sydney", "melbourne", "pyrmont"',
        ),
      page: z
        .number()
        .optional()
        .describe('Page number for paginated results (default: first page)'),
    },
  },
  [STATE_SEARCH_REL]: {
    name: 'search-states',
    description:
      'Search Australian states and territories by name or abbreviation. Returns all matching states.',
    schema: {
      q: z
        .string()
        .describe(
          'Australian state search query. e.g. "NSW", "New South Wales", "Victoria"',
        ),
      page: z
        .number()
        .optional()
        .describe('Page number for paginated results (default: first page)'),
    },
  },
  [HEALTH_REL]: {
    name: 'health',
    description: 'Check API service status. Returns version, timestamp, and health status.',
    schema: {},
  },
};

export async function createServer() {
  const key = process.env.ADDRESSR_RAPIDAPI_KEY || process.env.RAPIDAPI_KEY;
  if (!key) {
    console.error(
      'RAPIDAPI_KEY environment variable is required. Get one at https://rapidapi.com/addressr-addressr-default/api/addressr',
    );
    process.exit(1);
  }

  const headers = {
    'x-rapidapi-key': key,
    'x-rapidapi-host': API_HOST,
  };

  // Create a fetch-link instance with RapidAPI auth headers baked in
  const fetchLink = glowUpFetchWithLinks((url, init) =>
    fetch(url, { ...init, headers: { ...headers, ...init?.headers } }),
  );

  // Cache the API root discovery (1 week cache-control)
  let rootPromise;
  function getRoot() {
    if (!rootPromise) {
      rootPromise = fetchLink(API_URL).catch((err) => {
        rootPromise = undefined;
        throw err;
      });
    }
    return rootPromise;
  }

  const server = new McpServer({
    name: 'addressr',
    version: '0.1.0',
  });

  let root;
  let advertisedRels = new Set();
  try {
    root = await getRoot();
    const allLinks = root.links();
    if (allLinks.length === 0) {
      const status = root.status ?? 'unknown';
      throw new Error(
        `Addressr API root returned no rels (HTTP ${status}); ` +
          'check RAPIDAPI_KEY validity and subscription state at ' +
          'https://rapidapi.com/addressr-addressr-default/api/addressr',
      );
    }
    advertisedRels = new Set(allLinks.map((l) => l.rel));
  } catch (err) {
    console.warn(
      `Warning: Could not fetch Addressr API root (${err.message}). ` +
        'Falling back to registering only health and get-address tools.',
    );
  }

  // Register search tools dynamically for each advertised rel
  for (const [rel, config] of Object.entries(REL_TO_TOOL)) {
    if (rel === HEALTH_REL) {
      // Health is always registered — it has its own fallback logic
      continue;
    }

    if (!advertisedRels.has(rel)) {
      console.warn(`Warning: API root does not advertise ${rel}; skipping ${config.name}`);
      continue;
    }

    // Generic search tool handler
    server.tool(
      config.name,
      config.description,
      config.schema,
      async ({ q, page }) => {
        const root = await getRoot();
        const params = { q };
        if (page !== undefined) params.page = String(page);
        const searchLinks = root.links(rel, params);
        if (!searchLinks.length) {
          throw new Error(`Search link relation not found in API root: ${rel}`);
        }
        const response = await fetchLink(searchLinks[0]);
        const envelope = await toEnvelope(response);
        return { content: [{ type: 'text', text: JSON.stringify(envelope, null, 2) }] };
      },
    );
  }

  // Always register health — it has custom fallback logic
  server.tool(
    'health',
    'Check API service status. Returns version, timestamp, and health status.',
    {},
    async () => {
      const root = await getRoot();
      const healthLinks = root.links(HEALTH_REL);
      if (healthLinks.length && healthLinks[0].uri !== 'undefined') {
        const response = await fetchLink(healthLinks[0]);
        const envelope = await toEnvelope(response);
        return {
          content: [{ type: 'text', text: JSON.stringify(envelope, null, 2) }],
        };
      }
      // Fallback: health link URI is currently broken in production (returns "undefined")
      const baseUrl = new URL(root.url);
      const healthUrl = new URL('/health', baseUrl);
      const response = await fetchLink(healthUrl.toString());
      const envelope = await toEnvelope(response);
      return { content: [{ type: 'text', text: JSON.stringify(envelope, null, 2) }] };
    },
  );

  // Always register get-address (follows canonical links from search results)
  server.tool(
    'get-address',
    'Get full address details by URL. Follow the canonical link from search results to retrieve geocoding (lat/long), structured components (street, suburb, state, postcode, unit/flat), and confidence score.',
    {
      url: z
        .string()
        .describe(
          "Canonical URL for the address resource, e.g. 'https://addressr.p.rapidapi.com/addresses/GANSW710280564'. Obtained from search-addresses results._links.",
        ),
    },
    async ({ url }) => {
      const response = await fetchLink(url);
      const envelope = await toEnvelope(response);
      return { content: [{ type: 'text', text: JSON.stringify(envelope, null, 2) }] };
    },
  );

  server.tool(
    'get-locality',
    'Get full locality details by URL. Follow the canonical link from search results to retrieve structured locality data including name, state, postcode, and class.',
    {
      url: z
        .string()
        .describe(
          "Canonical URL for the locality resource, e.g. 'https://addressr.p.rapidapi.com/localities/GAUTH-12345'. Obtained from search-localities results._links.",
        ),
    },
    async ({ url }) => {
      const response = await fetchLink(url);
      const envelope = await toEnvelope(response);
      return { content: [{ type: 'text', text: JSON.stringify(envelope, null, 2) }] };
    },
  );

  server.tool(
    'get-postcode',
    'Get full postcode details by URL. Follow the canonical link from search results to retrieve the postcode and associated localities.',
    {
      url: z.string().describe("Canonical URL for the postcode resource, e.g. 'https://addressr.p.rapidapi.com/postcodes/2000'. Obtained from search-postcodes results._links."),
    },
    async ({ url }) => {
      const response = await fetchLink(url);
      const envelope = await toEnvelope(response);
      return { content: [{ type: 'text', text: JSON.stringify(envelope, null, 2) }] };
    },
  );

  server.tool(
    'get-state',
    'Get full state details by URL. Follow the canonical link from search results to retrieve state name and abbreviation.',
    {
      url: z
        .string()
        .describe(
          'Canonical URL for the state resource, e.g. "https://addressr.p.rapidapi.com/states/NSW". Obtained from search-states results._links.',
        ),
    },
    async ({ url }) => {
      const response = await fetchLink(url);
      const envelope = await toEnvelope(response);
      return { content: [{ type: 'text', text: JSON.stringify(envelope, null, 2) }] };
    },
  );

  return server;
}

async function toEnvelope(response) {
  const headers = Object.fromEntries(response.headers.entries());
  const body = await response.json();
  const linkHeader = headers.link;
  if (linkHeader) {
    headers.link = new LinkHeader(linkHeader).refs;
  }
  return { status: response.status, headers, body };
}

// Start server when run directly
const server = await createServer();
const transport = new StdioServerTransport();
await server.connect(transport);
