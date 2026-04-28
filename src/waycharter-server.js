//import connect from 'connect';
import debug from 'debug';
import express from 'express';
import { createServer } from 'node:http';
import { WayCharter } from '@mountainpass/waycharter';
import {
  searchForAddress,
  getAddress,
  searchForLocality,
  getLocality,
  searchForPostcode,
  getPostcode,
  searchForState,
  getState,
} from '../service/address-service';
import { version } from '../version';
import crypto from 'node:crypto';
import { validateProxyAuthConfig, proxyAuthMiddleware } from './proxy-auth';
import { validateReadShadowConfig } from './read-shadow';

var app = express();

const ONE_DAY = 60 * 60 * 24;
const ONE_WEEK = ONE_DAY * 7;

function buildOpenApiSpec(apiVersion) {
  const schemas = {
    AddressSearchResult: {
      type: 'object',
      properties: {
        sla: {
          type: 'string',
          description: 'Single line address',
          example: 'UNIT 1, 19 MURRAY RD, CHRISTMAS ISLAND OT 6798',
        },
        ssla: {
          type: 'string',
          description: 'Short single line address (for addresses with flats)',
          example: '1/19 MURRAY RD, CHRISTMAS ISLAND OT 6798',
        },
        highlight: {
          type: 'object',
          description: 'Search term highlights in the address',
          properties: {
            sla: { type: 'string' },
            ssla: { type: 'string' },
          },
        },
        score: {
          type: 'number',
          description: 'Search relevance score',
          example: 5.43,
        },
        pid: {
          type: 'string',
          description: 'Persistent identifier for the address',
          example: 'GAOT_717882967',
        },
      },
    },
    Address: {
      type: 'object',
      properties: {
        sla: {
          type: 'string',
          example: 'UNIT 1, 19 MURRAY RD, CHRISTMAS ISLAND OT 6798',
        },
        structured: {
          type: 'object',
          properties: {
            confidence: { type: 'integer', example: 2 },
            flat: {
              type: 'object',
              properties: {
                number: { type: 'integer', example: 1 },
                type: {
                  type: 'object',
                  properties: {
                    code: { type: 'string', example: 'UNIT' },
                    name: { type: 'string', example: 'UNIT' },
                  },
                },
              },
            },
            number: {
              type: 'object',
              properties: { number: { type: 'integer', example: 19 } },
            },
            street: {
              type: 'object',
              properties: {
                name: { type: 'string', example: 'MURRAY' },
                type: {
                  type: 'object',
                  properties: {
                    code: { type: 'string', example: 'ROAD' },
                    name: { type: 'string', example: 'RD' },
                  },
                },
              },
            },
            locality: {
              type: 'object',
              properties: {
                name: { type: 'string', example: 'CHRISTMAS ISLAND' },
                class: {
                  type: 'object',
                  properties: {
                    code: { type: 'string', example: 'U' },
                    name: { type: 'string', example: 'UNOFFICIAL SUBURB' },
                  },
                },
              },
            },
            postcode: { type: 'string', example: '6798' },
            state: {
              type: 'object',
              properties: {
                abbreviation: { type: 'string', example: 'OT' },
                name: { type: 'string', example: 'OTHER TERRITORIES' },
              },
            },
          },
        },
      },
    },
    LocalitySearchResult: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'LILYDALE' },
        state: {
          type: 'object',
          properties: {
            name: { type: 'string', example: 'VICTORIA' },
            abbreviation: { type: 'string', example: 'VIC' },
          },
        },
        class: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description:
                'Classification code (G=Gazetted, U=Unofficial, T=Topographic, I=Informal)',
              example: 'G',
            },
            name: { type: 'string', example: 'GAZETTED LOCALITY' },
          },
        },
        postcode: {
          type: 'string',
          description: 'Primary postcode for this locality',
          example: '3140',
        },
        score: { type: 'number', example: 5.23 },
        pid: { type: 'string', example: 'loc1234567890ab' },
      },
    },
    Locality: {
      type: 'object',
      properties: {
        locality_name: { type: 'string', example: 'CHRISTMAS ISLAND' },
        locality_class_code: { type: 'string', example: 'U' },
        locality_class_name: { type: 'string', example: 'UNOFFICIAL SUBURB' },
        primary_postcode: { type: 'string', example: '6798' },
        postcodes: {
          type: 'array',
          items: { type: 'string' },
          example: ['6798'],
        },
        state_abbreviation: { type: 'string', example: 'OT' },
        state_name: { type: 'string', example: 'OTHER TERRITORIES' },
        locality_pid: { type: 'string', example: 'loc9984d8beb142' },
      },
    },
    PostcodeSearchResult: {
      type: 'object',
      properties: {
        postcode: { type: 'string', example: '3140' },
        localities: {
          type: 'array',
          items: {
            type: 'object',
            properties: { name: { type: 'string', example: 'LILYDALE' } },
          },
        },
      },
    },
    PostcodeDetail: {
      type: 'object',
      properties: {
        postcode: { type: 'string', example: '6798' },
        localities: {
          type: 'array',
          description:
            'Locality names. Individual locality resources are linked via related Link headers.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', example: 'CHRISTMAS ISLAND' },
            },
          },
        },
      },
    },
    State: {
      type: 'object',
      properties: {
        abbreviation: { type: 'string', example: 'NSW' },
        name: { type: 'string', example: 'NEW SOUTH WALES' },
      },
    },
    Health: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'healthy' },
        version: { type: 'string', example: '2.1.2' },
        timestamp: {
          type: 'string',
          format: 'date-time',
          example: '2026-04-14T11:17:54.637Z',
        },
      },
    },
  };

  return {
    openapi: '3.0.3',
    info: {
      title: 'Addressr by Mountain Pass',
      description:
        'Free Australian Address Validation, Search and Autocomplete. This OpenAPI spec is supplementary — the HATEOAS link-driven API is the authoritative contract. Follow `related` Link headers to navigate between addresses, localities, postcodes and states.\n\nDirect requests to upstream hosts may be rejected when the operator has configured a gateway auth header. Consumers should always call Addressr through its published gateway endpoint; monitoring (`/health`) and spec discovery (`/api-docs`) remain openly reachable.',
      version: apiVersion,
    },
    servers: [
      { url: 'https://addressr.p.rapidapi.com', description: 'RapidAPI' },
    ],
    paths: {
      '/addresses': {
        get: {
          summary: 'Search Addresses',
          description:
            'Search Australian addresses by any component — street, suburb, postcode, state. Supports fuzzy and prefix matching.',
          operationId: 'searchAddresses',
          tags: ['Addresses'],
          parameters: [
            {
              name: 'q',
              in: 'query',
              required: true,
              schema: { type: 'string', minLength: 3 },
              example: 'UNIT 1, 19 MURRAY RD, CHRISTMAS ISLAND',
              description: 'Address search query (min 3 characters)',
            },
            {
              name: 'page',
              in: 'query',
              required: false,
              schema: { type: 'integer', minimum: 0 },
              example: 0,
              description: 'Zero-based page number for pagination',
            },
          ],
          responses: {
            200: {
              description: 'List of matching addresses',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/AddressSearchResult' },
                  },
                },
              },
            },
          },
        },
      },
      '/addresses/{pid}': {
        get: {
          summary: 'Get Address',
          description:
            'Get full structured details for a specific address. Response includes Link headers with `related` rels to the locality, postcode, and state.',
          operationId: 'getAddress',
          tags: ['Addresses'],
          parameters: [
            {
              name: 'pid',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              example: 'GAOT_717882967',
              description: 'Address persistent identifier (G-NAF PID)',
            },
          ],
          responses: {
            200: {
              description: 'Address details with structured data',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Address' },
                },
              },
            },
          },
        },
      },
      '/localities': {
        get: {
          summary: 'Search Localities',
          description:
            'Search Australian suburbs and localities by name. Supports fuzzy and prefix matching. Returns localities with state, postcode, and classification.',
          operationId: 'searchLocalities',
          tags: ['Localities'],
          parameters: [
            {
              name: 'q',
              in: 'query',
              required: true,
              schema: { type: 'string', minLength: 2 },
              example: 'lilydale',
              description:
                'Locality/suburb name search query (min 2 characters)',
            },
          ],
          responses: {
            200: {
              description: 'List of matching localities',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      $ref: '#/components/schemas/LocalitySearchResult',
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/localities/{pid}': {
        get: {
          summary: 'Get Locality',
          description:
            'Get details for a specific locality. Response includes Link headers with `related` rels to the postcode and state.',
          operationId: 'getLocality',
          tags: ['Localities'],
          parameters: [
            {
              name: 'pid',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              example: 'loc9984d8beb142',
              description: 'Locality persistent identifier',
            },
          ],
          responses: {
            200: {
              description: 'Locality details',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Locality' },
                },
              },
            },
          },
        },
      },
      '/postcodes': {
        get: {
          summary: 'Search Postcodes',
          description:
            'Search Australian postcodes by prefix. Returns matching postcodes with their associated localities. Omit `q` to list all postcodes in ascending order.',
          operationId: 'searchPostcodes',
          tags: ['Postcodes'],
          parameters: [
            {
              name: 'q',
              in: 'query',
              required: false,
              schema: { type: 'string' },
              example: '314',
              description:
                'Postcode prefix search query (0+ characters). Omit to list all postcodes.',
            },
          ],
          responses: {
            200: {
              description:
                'List of matching postcodes with associated localities',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      $ref: '#/components/schemas/PostcodeSearchResult',
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/postcodes/{postcode}': {
        get: {
          summary: 'Get Postcode',
          description:
            'Get details for a specific postcode including all associated localities. Each locality is linked via a `related` Link header.',
          operationId: 'getPostcode',
          tags: ['Postcodes'],
          parameters: [
            {
              name: 'postcode',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              example: '6798',
              description: 'Australian postcode',
            },
          ],
          responses: {
            200: {
              description: 'Postcode details with associated localities',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/PostcodeDetail' },
                },
              },
            },
          },
        },
      },
      '/states': {
        get: {
          summary: 'Search States',
          description:
            'Search Australian states and territories by name or abbreviation. Omit `q` to list all states alphabetically.',
          operationId: 'searchStates',
          tags: ['States'],
          parameters: [
            {
              name: 'q',
              in: 'query',
              required: false,
              schema: { type: 'string' },
              example: 'New',
              description:
                'State name or abbreviation search (0+ characters). Omit to list all states.',
            },
          ],
          responses: {
            200: {
              description: 'List of matching states and territories',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/State' },
                  },
                },
              },
            },
          },
        },
      },
      '/states/{abbreviation}': {
        get: {
          summary: 'Get State',
          description:
            'Get details for a specific state or territory. Use `/localities?q=` or `/postcodes?q=` to search within a state.',
          operationId: 'getState',
          tags: ['States'],
          parameters: [
            {
              name: 'abbreviation',
              in: 'path',
              required: true,
              schema: {
                type: 'string',
                enum: [
                  'ACT',
                  'NSW',
                  'NT',
                  'QLD',
                  'SA',
                  'TAS',
                  'VIC',
                  'WA',
                  'OT',
                ],
              },
              example: 'NSW',
              description: 'State/territory abbreviation',
            },
          ],
          responses: {
            200: {
              description: 'State/territory details',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/State' },
                },
              },
            },
          },
        },
      },
      '/health': {
        get: {
          summary: 'Health Check',
          description:
            'Check API service status. Returns version, timestamp, and health status.',
          operationId: 'healthCheck',
          tags: ['System'],
          responses: {
            200: {
              description: 'API is healthy',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Health' },
                },
              },
            },
          },
        },
      },
    },
    components: { schemas },
    tags: [
      { name: 'Addresses', description: 'Search and retrieve addresses' },
      {
        name: 'Localities',
        description: 'Search and retrieve suburbs/localities',
      },
      { name: 'Postcodes', description: 'Search and retrieve postcodes' },
      { name: 'States', description: 'Search and retrieve states/territories' },
      { name: 'System', description: 'System endpoints' },
    ],
  };
}

var serverPort = process.env.PORT || 8080;
var logger = debug('api');
var error = debug('error');
error.log = console.error.bind(console);

let server;

const PAGE_SIZE = process.env.PAGE_SIZE || 8;

export function startRest2Server() {
  validateProxyAuthConfig();
  validateReadShadowConfig();
  app.use((_request, response, next) => {
    if (process.env.ADDRESSR_ACCESS_CONTROL_ALLOW_ORIGIN !== undefined) {
      response.append(
        'Access-Control-Allow-Origin',
        process.env.ADDRESSR_ACCESS_CONTROL_ALLOW_ORIGIN,
      );
    }
    if (process.env.ADDRESSR_ACCESS_CONTROL_EXPOSE_HEADERS !== undefined) {
      response.append(
        'Access-Control-Expose-Headers',
        process.env.ADDRESSR_ACCESS_CONTROL_EXPOSE_HEADERS,
      );
    }
    if (process.env.ADDRESSR_ACCESS_CONTROL_ALLOW_HEADERS !== undefined) {
      response.append(
        'Access-Control-Allow-Headers',
        process.env.ADDRESSR_ACCESS_CONTROL_ALLOW_HEADERS,
      );
    }

    next();
  });

  app.use(proxyAuthMiddleware());

  const waycharter = new WayCharter();
  app.use(waycharter.router);

  const addressesType = waycharter.registerCollection({
    itemPath: '/:pid',
    itemLoader: async ({ pid }) => {
      const { json, hash, statusCode, localityPid } = await getAddress(pid);

      const links = [];
      if (localityPid) {
        links.push({
          rel: 'related',
          uri: `/localities/${localityPid}`,
          title: json.structured?.locality?.name || 'Locality',
        });
      }
      if (json.structured) {
        const s = json.structured;
        if (s.postcode) {
          links.push({
            rel: 'related',
            uri: `/postcodes/${s.postcode}`,
            title: `Postcode ${s.postcode}`,
          });
        }
        if (s.state && s.state.abbreviation) {
          links.push({
            rel: 'related',
            uri: `/states/${s.state.abbreviation}`,
            title: s.state.name,
          });
        }
      }

      return {
        body: json,
        links,
        headers: {
          etag: `"${version}-${hash}"`,
          'cache-control': `public, max-age=${ONE_WEEK}`,
        },
        status: statusCode || 200,
      };
    },
    collectionPath: '/addresses',
    collectionLoader: async ({ page, q }) => {
      if (q && q.length > 2) {
        const foundAddresses = await searchForAddress(q, page + 1, PAGE_SIZE);
        const body = foundAddresses.body.hits.hits.map((h) => {
          return {
            sla: h._source.sla,
            ...(h._source.ssla && { ssla: h._source.ssla }),
            highlight: {
              sla: h.highlight.sla[0],
              ...(h.highlight.ssla && { ssla: h.highlight.ssla[0] }),
            },
            score: h._score,
            pid: h._id.replace('/addresses/', ''),
          };
        });
        const responseHash = crypto
          .createHash('md5')
          .update(JSON.stringify(body))
          .digest('hex');
        return {
          body,
          hasMore: page < foundAddresses.body.hits.total.value / PAGE_SIZE - 1,
          headers: {
            etag: `"${version}-${responseHash}"`,
            'cache-control': `public, max-age=${ONE_WEEK}`,
          },
        };
      } else {
        // If-None-Match
        return {
          body: [],
          hasMore: false,
          headers: {
            etag: `"${version}"`,
            'cache-control': `public, max-age=${ONE_WEEK}`,
          },
        };
      }
    },
    filters: [
      {
        rel: 'https://addressr.io/rels/address-search',
        parameters: ['q'],
      },
    ],
  });

  const localitiesType = waycharter.registerCollection({
    itemPath: '/:pid',
    itemLoader: async ({ pid }) => {
      const resp = await getLocality(pid);
      const source = resp.body._source;
      const links = [];
      if (source.primary_postcode) {
        links.push({
          rel: 'related',
          uri: `/postcodes/${source.primary_postcode}`,
          title: `Postcode ${source.primary_postcode}`,
        });
      }
      if (source.state_abbreviation) {
        links.push({
          rel: 'related',
          uri: `/states/${source.state_abbreviation}`,
          title: source.state_name,
        });
      }
      const hash = crypto
        .createHash('md5')
        .update(JSON.stringify(source))
        .digest('hex');
      return {
        body: source,
        links,
        headers: {
          etag: `"${version}-${hash}"`,
          'cache-control': `public, max-age=${ONE_WEEK}`,
        },
        status: 200,
      };
    },
    collectionPath: '/localities',
    collectionLoader: async ({ page, q }) => {
      if (q && q.length > 1) {
        const foundLocalities = await searchForLocality(q, page + 1, PAGE_SIZE);
        const body = foundLocalities.body.hits.hits.map((h) => {
          return {
            name: h._source.locality_name,
            state: {
              name: h._source.state_name,
              abbreviation: h._source.state_abbreviation,
            },
            ...(h._source.locality_class_code && {
              class: {
                code: h._source.locality_class_code,
                name: h._source.locality_class_name,
              },
            }),
            ...(h._source.primary_postcode && {
              postcode: h._source.primary_postcode,
            }),
            score: h._score,
            pid: h._id.replace('/localities/', ''),
          };
        });
        const responseHash = crypto
          .createHash('md5')
          .update(JSON.stringify(body))
          .digest('hex');
        return {
          body,
          hasMore: page < foundLocalities.body.hits.total.value / PAGE_SIZE - 1,
          headers: {
            etag: `"${version}-${responseHash}"`,
            'cache-control': `public, max-age=${ONE_WEEK}`,
          },
        };
      } else {
        return {
          body: [],
          hasMore: false,
          headers: {
            etag: `"${version}"`,
            'cache-control': `public, max-age=${ONE_WEEK}`,
          },
        };
      }
    },
    filters: [
      {
        rel: 'https://addressr.io/rels/locality-search',
        parameters: ['q'],
      },
    ],
  });

  const postcodesType = waycharter.registerCollection({
    itemPath: '/:postcode',
    itemLoader: async ({ postcode }) => {
      const result = await getPostcode(postcode);
      const hits = result.body.hits.hits;
      const localities = hits.map((h) => ({
        name: h._source.locality_name,
      }));
      const links = hits.map((h) => ({
        rel: 'related',
        uri: `/localities/${h._source.locality_pid}`,
        title: h._source.locality_name,
      }));
      const body = { postcode, localities };
      const hash = crypto
        .createHash('md5')
        .update(JSON.stringify(body))
        .digest('hex');
      return {
        body,
        links,
        headers: {
          etag: `"${version}-${hash}"`,
          'cache-control': `public, max-age=${ONE_WEEK}`,
        },
        status: 200,
      };
    },
    collectionPath: '/postcodes',
    collectionLoader: async ({ q }) => {
      const result = await searchForPostcode(q || '');
      const buckets = result.body.aggregations.postcodes.buckets;
      const body = buckets.map((bucket) => ({
        postcode: bucket.key,
        localities: bucket.localities.buckets.map((l) => ({
          name: l.key,
        })),
      }));
      const responseHash = crypto
        .createHash('md5')
        .update(JSON.stringify(body))
        .digest('hex');
      return {
        body,
        hasMore: false,
        headers: {
          etag: `"${version}-${responseHash}"`,
          'cache-control': `public, max-age=${ONE_WEEK}`,
        },
      };
    },
    filters: [
      {
        rel: 'https://addressr.io/rels/postcode-search',
        parameters: ['q'],
      },
    ],
  });

  const statesType = waycharter.registerCollection({
    itemPath: '/:abbreviation',
    itemLoader: async ({ abbreviation }) => {
      const result = await getState(abbreviation);
      const stateName =
        result.body.aggregations.state_name.buckets[0]?.key ||
        abbreviation.toUpperCase();
      const body = {
        abbreviation: abbreviation.toUpperCase(),
        name: stateName,
      };
      const hash = crypto
        .createHash('md5')
        .update(JSON.stringify(body))
        .digest('hex');
      return {
        body,
        headers: {
          etag: `"${version}-${hash}"`,
          'cache-control': `public, max-age=${ONE_WEEK}`,
        },
        status: 200,
      };
    },
    collectionPath: '/states',
    collectionLoader: async ({ q }) => {
      const result = await searchForState(q || undefined);
      const buckets = result.body.aggregations.states.buckets;
      const body = buckets.map((bucket) => ({
        abbreviation: bucket.key,
        name: bucket.state_name.buckets[0]?.key || bucket.key,
      }));
      const responseHash = crypto
        .createHash('md5')
        .update(JSON.stringify(body))
        .digest('hex');
      return {
        body,
        hasMore: false,
        headers: {
          etag: `"${version}-${responseHash}"`,
          'cache-control': `public, max-age=${ONE_WEEK}`,
        },
      };
    },
    filters: [
      {
        rel: 'https://addressr.io/rels/state-search',
        parameters: ['q'],
      },
    ],
  });

  waycharter.registerResourceType({
    path: '/health',
    loader: async () => {
      return {
        body: {
          status: 'healthy',
          version: version,
          timestamp: new Date().toISOString(),
        },
        headers: {
          'cache-control': 'no-cache',
        },
      };
    },
  });

  waycharter.registerResourceType({
    path: '/api-docs',
    loader: async () => {
      const spec = buildOpenApiSpec(version);
      return {
        body: spec,
        headers: {
          'cache-control': `public, max-age=${ONE_WEEK}`,
          'content-type': 'application/json',
        },
      };
    },
  });

  waycharter.registerResourceType({
    path: '/',
    loader: async () => {
      return {
        body: {},
        links: [
          ...addressesType.additionalPaths,
          ...localitiesType.additionalPaths,
          ...postcodesType.additionalPaths,
          ...statesType.additionalPaths,
          { rel: 'https://addressr.io/rels/api-docs', uri: '/api-docs' },
          { rel: 'https://addressr.io/rels/health', uri: '/health' },
        ],
        headers: {
          etag: `"${version}"`,
          // Long-lived by design (P018 parked). New rels are added
          // infrequently and every client page load fetches this for
          // HATEOAS discovery; a short TTL would cost an origin
          // round-trip per request. When the rel set does change,
          // request a RapidAPI CF purge (natural expiry up to 7 days
          // per P017 close notes).
          'cache-control': `public, max-age=${ONE_WEEK}`,
        },
      };
    },
  });

  server = createServer(app);
  return new Promise((resolve) => {
    server.listen(serverPort, function () {
      logger(
        '📡  Addressr is listening on port %d ( http://localhost:%d ) ',
        serverPort,
        serverPort,
      );
      resolve(`http://localhost:${serverPort}`);
    });
  });
}

export function stopServer() {
  if (server !== undefined) {
    server.close();
  }
}
