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

var app = express();

const ONE_DAY = 60 * 60 * 24;
const ONE_WEEK = ONE_DAY * 7;

var serverPort = process.env.PORT || 8080;
var logger = debug('api');
var error = debug('error');
error.log = console.error.bind(console);

let server;

const PAGE_SIZE = process.env.PAGE_SIZE || 8;

export function startRest2Server() {
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

  const waycharter = new WayCharter();
  app.use(waycharter.router);

  const addressesType = waycharter.registerCollection({
    itemPath: '/:pid',
    itemLoader: async ({ pid }) => {
      const { json, hash, statusCode } = await getAddress(pid);

      return {
        body: json,
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
      const hash = crypto
        .createHash('md5')
        .update(JSON.stringify(source))
        .digest('hex');
      return {
        body: source,
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
      const localities = result.body.aggregations.localities.buckets.map(
        (l) => ({ name: l.key }),
      );
      const body = { postcode, localities };
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
      const localities = result.body.aggregations.localities.buckets.map(
        (l) => ({ name: l.key }),
      );
      const postcodes = result.body.aggregations.postcodes.buckets.map(
        (p) => p.key,
      );
      const body = {
        abbreviation: abbreviation.toUpperCase(),
        name: stateName,
        localities,
        postcodes,
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
    path: '/',
    loader: async () => {
      return {
        body: {},
        links: [
          ...addressesType.additionalPaths,
          ...localitiesType.additionalPaths,
          ...postcodesType.additionalPaths,
          ...statesType.additionalPaths,
          { rel: 'https://addressr.io/rels/health', uri: '/health' },
        ],
        headers: {
          etag: `"${version}"`,
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
