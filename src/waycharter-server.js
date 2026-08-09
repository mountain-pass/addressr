//import connect from 'connect';
import { isPreflightEnabled, buildPreflightHandler } from './cors-preflight.js';
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
} from '../service/address-service.js';
import { version } from '../version.js';
import crypto from 'node:crypto';
import { validateProxyAuthConfig, proxyAuthMiddleware } from './proxy-auth.js';
import { validateReadShadowConfig, getShadowStatus } from './read-shadow.js';
import { checkEsHealthCached, isEsProbeEnabled } from './es-health.js';

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
      // The response is `{ ..._source.structured, sla }` (service/address-service.js
      // getAddress), so every key of the stored `structured` wrapper is served at the
      // TOP level here. Until 2026-08-09 this schema listed only `sla` and
      // `structured`, and the other five were served undocumented. P091 found that
      // by accident while investigating one of them.
      properties: {
        sla: {
          type: 'string',
          example: 'UNIT 1, 19 MURRAY RD, CHRISTMAS ISLAND OT 6798',
        },
        pid: {
          type: 'string',
          description:
            'Persistent identifier, unique to the real-world feature this record represents.',
          example: 'GAOT_717882967',
        },
        mla: {
          type: 'array',
          items: { type: 'string' },
          description: 'Multi-line form of the address, one element per line.',
          example: ['UNIT 1', '19 MURRAY RD', 'CHRISTMAS ISLAND OT 6798'],
        },
        smla: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Short multi-line form, present only when the address has a flat component. ' +
            'Note there is no `ssla` here: the short SINGLE-line form belongs to the search ' +
            'result, not to this representation.',
          example: ['1/19 MURRAY RD', 'CHRISTMAS ISLAND OT 6798'],
        },
        geocoding: {
          type: 'object',
          description: 'Geocoding information for the address.',
        },
        precedence: {
          type: 'string',
          deprecated: true,
          description:
            "DEPRECATED — do not depend on this field. It carries the source dataset's " +
            'primary/secondary flag and has never been part of any published spec. It is ' +
            'documented here only so its removal is announced rather than silent.',
        },
        sla_range_expanded: {
          type: 'array',
          items: { type: 'string' },
          deprecated: true,
          description:
            'DEPRECATED — do not depend on this field, and do not use it for search. ' +
            'It holds the two endpoint forms of a range address (so "103-107 GAZE RD" ' +
            'carries "103 GAZE RD" and "107 GAZE RD"), but it has NEVER been searchable: ' +
            'it was written to a path the index mapping does not cover, so no query has ' +
            'ever matched it. Measured against production, range addresses are already ' +
            'reachable by either endpoint without it. Scheduled for removal; retained for ' +
            'now only so the response body and ETag of existing range addresses do not ' +
            'change. See ADR-028.',
          example: [
            '103 GAZE RD, CHRISTMAS ISLAND OT 6798',
            '107 GAZE RD, CHRISTMAS ISLAND OT 6798',
          ],
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
import { trackServer } from './graceful-shutdown.js';

var error = debug('error');
error.log = console.error.bind(console);

const PAGE_SIZE = process.env.PAGE_SIZE || 8;

// Build and return the configured v2 Express app WITHOUT starting a listener.
// Used by startRest2Server() (production) and by the in-process test tier
// (light-my-request injection via waychaser's pluggable fetch). A fresh app is
// created per call so repeated builds do not double-register middleware/routes.
export function buildRest2App() {
  const app = express();
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

  // P023 / ADR-037: answer CORS preflight (OPTIONS) with Access-Control-Max-Age
  // so cross-origin browsers cache the preflight instead of re-running it on
  // every GET. This handler MUST be registered BEFORE proxyAuthMiddleware():
  // a raw preflight carries no gateway secret, so on a proxy-auth-enabled
  // origin it would otherwise be 401-ed and the browser would never see the
  // cache directive. OPTIONS exposes no user data — the data-carrying methods
  // still fall through to proxyAuthMiddleware and remain enforced.
  //
  // Risk remediation R1 (STOP 6/25 → within appetite): gated behind the SAME
  // ADDRESSR_ACCESS_CONTROL_ALLOW_ORIGIN opt-in as the sibling CORS response
  // headers above. Access-Control-Max-Age is meaningless without
  // Access-Control-Allow-Origin, so when CORS is not enabled the handler is not
  // registered at all — no cache directive, and the OPTIONS auth-exemption does
  // not exist (preflight reverts to prior behaviour). When CORS IS enabled the
  // fix applies as approved: Max-Age 86400 + Allow-Methods GET,OPTIONS defaults,
  // 204, registered before proxyAuthMiddleware.
  // Response shape and gating extracted to src/cors-preflight.js so they can be
  // executed by a test rather than regex-matched here (P033). The REGISTRATION
  // ORDER below — ahead of proxyAuthMiddleware — is the part that cannot move.
  // Its primary guard is test/js/__tests__/waycharter-server.test.mjs, which
  // asserts it by behaviour: an unauthenticated OPTIONS here is 204 while an
  // unauthenticated GET on the same path is 401. proxy-auth.test.mjs keeps the
  // complementary half — that no data-carrying method is short-circuited ahead
  // of the middleware — and that half is still source inspection (P033).
  if (isPreflightEnabled()) {
    app.options(/.*/, buildPreflightHandler());
  }

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
        // eslint-disable-next-line unicorn/no-useless-else -- pre-existing, untouched by this change: the else carries the If-None-Match branch; collapsing it rewrites live cache control flow. No unit cover to catch a mistake — the gap P033 exists to close. Tracked on P084.
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
        // eslint-disable-next-line unicorn/no-useless-else -- pre-existing, untouched by this change: the else carries the If-None-Match branch; collapsing it rewrites live cache control flow. No unit cover to catch a mistake — the gap P033 exists to close. Tracked on P084.
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
      // ADR 029 zero-outage: probe OpenSearch so a misconfigured v2/SigV4
      // cutover fails EB's health-gated rollout (auto-rollback) rather than
      // serving query errors. 503 on ES-down; ELB UnhealthyThreshold=5 at a 10s
      // interval (~50s sustained) absorbs the brief startup-connect window and
      // transient blips. HEALTH_ES_PROBE=off reverts to always-200 (ops valve).
      const esHealth = isEsProbeEnabled()
        ? await checkEsHealthCached(globalThis.esClient)
        : { ok: true };
      return {
        status: esHealth.ok ? 200 : 503,
        body: {
          status: esHealth.ok ? 'healthy' : 'unhealthy',
          version: version,
          timestamp: new Date().toISOString(),
          // eslint-disable-next-line unicorn/consistent-conditional-object-spread -- pre-existing, untouched by this change: this is the /health response body; restructuring it changes a shipped response shape. No unit cover to catch a mistake — the gap P033 exists to close. Tracked on P084.
          ...(esHealth.ok ? {} : { reason: esHealth.reason }),
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

  // P035: operator-diagnostic endpoint for read-shadow runtime introspection.
  // Returns config-presence booleans + counters + closed-enum lastError;
  // never returns hostnames, secrets, or free-text error messages.
  // ALLOWLIST'd in src/proxy-auth.js per the debug-endpoint policy.
  waycharter.registerResourceType({
    path: '/debug/shadow-config',
    loader: async () => {
      return {
        body: getShadowStatus(),
        headers: {
          'cache-control': 'no-cache',
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

  return app;
}

export function startRest2Server() {
  validateProxyAuthConfig();
  validateReadShadowConfig();
  const app = buildRest2App();
  const server = trackServer(createServer(app));
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

// Both live in ./graceful-shutdown.js with the handle they act on, so a unit
// test can execute them. The reason they were moved there — that this module
// COULD NOT be imported by raw Node ESM (P033) — expired on 2026-08-08 when
// ADR-044 retired Babel; waycharter-server.test.mjs now imports this module
// directly. The extraction stands on its own merits and is not being undone,
// but do not cite the old blocker as a live reason to extract anything else.
// Re-exported here because server2.js and test/js/world.js import them from
// this path.
export { stopServer, forceCloseConnections } from './graceful-shutdown.js';
