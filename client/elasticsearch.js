const waitPort = require('wait-port');
const elasticsearch = require('@opensearch-project/opensearch');
import debug from 'debug';
import { buildClientNode } from '../src/client-node-url.js';
import {
  indexConfigMatches,
  retryOnSnapshotInProgress,
  buildAddressIndexBody,
  buildLocalityIndexBody,
  isStaleAnalysisConfig,
  staleIndexMessage,
} from '../src/init-index-config.js';
import { resolveAuthMode, buildEsClientOptions } from '../src/es-auth.js';

// ADR 033: region for SigV4 signing when ELASTIC_AUTH_MODE=sigv4. Ignored
// in the default basic-auth path (self-hosted / local Docker / v1).
const ELASTIC_REGION = process.env.ELASTIC_REGION || 'ap-southeast-2';
const logger = debug('api');
const error = debug('error');

const ES_INDEX_NAME = process.env.ES_INDEX_NAME || 'addressr';
export const ES_LOCALITY_INDEX_NAME = `${ES_INDEX_NAME}-localities`;
export const ELASTIC_PORT = Number.parseInt(process.env.ELASTIC_PORT || '9200');
const ELASTIC_HOST = process.env.ELASTIC_HOST || '127.0.0.1';
const ELASTIC_USERNAME = process.env.ELASTIC_USERNAME || undefined;
const ELASTIC_PASSWORD = process.env.ELASTIC_PASSWORD || undefined;
const ELASTIC_PROTOCOL = process.env.ELASTIC_PROTOCOL || 'http';

export async function dropIndex(esClient) {
  let exists = await esClient.indices.exists({ index: ES_INDEX_NAME });
  if (exists.body) {
    const deleteIndexResult = await esClient.indices.delete({
      index: ES_INDEX_NAME,
    });
    logger({ deleteIndexResult });
  }
  logger('checking if index exists');

  exists = await esClient.indices.exists({ index: ES_INDEX_NAME });
  logger('index exists:', exists);
}

export async function initIndex(esClient, clear, synonyms) {
  if (clear) {
    await dropIndex(esClient);
  }
  logger('checking if index exists');

  const exists = await esClient.indices.exists({ index: ES_INDEX_NAME });
  logger('index exists:', exists.body);
  // ADR-041 / P069: settings + mappings come from the clean-ESM builder so a
  // behavioural test can assert the exact config production uses.
  const indexBody = buildAddressIndexBody(synonyms);

  if (exists.body) {
    // P037 fast-path: settings/mappings don't change between state loads,
    // so skip the close-update-open dance (and its race with AWS hourly
    // automated snapshots, I001) when the stored config already matches.
    const [currentSettings, currentMapping] = await Promise.all([
      esClient.indices.getSettings({ index: ES_INDEX_NAME }),
      esClient.indices.getMapping({ index: ES_INDEX_NAME }),
    ]);
    // ADR-041 / P069: fail loud on an index whose analysis config predates the
    // equivalent-synonym change. The close/putSettings/putMapping path below
    // SUCCEEDS on such an index — every call returns acknowledged — while every
    // existing document keeps postings from the old analyzer, so the defect
    // stays live and indexConfigMatches then returns true forever, masking it.
    // Measured on OpenSearch 3.5.0; see ADR-041 § Stale-Index Handling.
    //
    // Keyed on the _meta structure stamp, NOT indexConfigMatches: that
    // predicate is deliberately conservative and returns false for benign
    // drift, which must keep taking the update path below rather than aborting.
    if (
      isStaleAnalysisConfig(
        currentMapping.body,
        ES_INDEX_NAME,
        indexBody.mappings._meta.analysisStamp,
      )
    ) {
      throw new Error(staleIndexMessage(ES_INDEX_NAME));
    }
    if (
      indexConfigMatches(
        indexBody,
        currentSettings.body,
        currentMapping.body,
        ES_INDEX_NAME,
      )
    ) {
      logger(
        'index settings and mappings already match; skipping close-update-open (P037)',
      );
    } else {
      // update the index. Close can collide with an in-progress automated
      // snapshot on AWS-managed domains — retry per P037.
      const indexCloseResult = await retryOnSnapshotInProgress(() =>
        esClient.indices.close({
          index: ES_INDEX_NAME,
        }),
      );
      logger({ indexCloseResult });
      const indexPutSettingsResult = await esClient.indices.putSettings({
        index: ES_INDEX_NAME,
        body: indexBody,
      });
      logger({ indexPutSettingsResult });
      const indexPutMappingResult = await esClient.indices.putMapping({
        index: ES_INDEX_NAME,
        body: indexBody.mappings,
      });
      logger({ indexPutMappingResult });

      const indexOpenResult = await esClient.indices.open({
        index: ES_INDEX_NAME,
      });
      logger({ indexOpenResult });
      const refreshResult = await esClient.indices.refresh({
        index: ES_INDEX_NAME,
      });
      logger({ refreshResult });
    }
  } else {
    logger(`creating index: ${ES_INDEX_NAME}`);
    const indexCreateResult = await esClient.indices.create({
      index: ES_INDEX_NAME,
      body: indexBody,
    });
    logger({ indexCreateResult });
  }
  const indexGetResult = await esClient.indices.get({
    index: ES_INDEX_NAME,
    include_defaults: true,
  });
  logger(`indexGetResult:\n${JSON.stringify(indexGetResult, undefined, 2)}`);
}

export async function dropLocalityIndex(esClient) {
  let exists = await esClient.indices.exists({ index: ES_LOCALITY_INDEX_NAME });
  if (exists.body) {
    const deleteIndexResult = await esClient.indices.delete({
      index: ES_LOCALITY_INDEX_NAME,
    });
    logger({ deleteIndexResult });
  }
}

export async function initLocalityIndex(esClient, clear, synonyms) {
  if (clear) {
    await dropLocalityIndex(esClient);
  }

  const exists = await esClient.indices.exists({
    index: ES_LOCALITY_INDEX_NAME,
  });
  // ADR-041: one builder for both indexes so the analysis pipeline cannot
  // drift between them (ADR-021 same-pipeline criterion).
  //
  // Deliberately NO stale-analysis fail-loud here, unlike initIndex. This path
  // half-migrates identically, but the loader rewrites EVERY locality document
  // immediately afterwards, so its postings self-heal on the next load. The
  // exemption depends entirely on that full rewrite: if the locality load ever
  // becomes incremental, add the guard or P069 silently re-opens on this index.
  const indexBody = buildLocalityIndexBody(synonyms);

  if (exists.body) {
    const indexCloseResult = await esClient.indices.close({
      index: ES_LOCALITY_INDEX_NAME,
    });
    logger({ indexCloseResult });
    const indexPutSettingsResult = await esClient.indices.putSettings({
      index: ES_LOCALITY_INDEX_NAME,
      body: indexBody,
    });
    logger({ indexPutSettingsResult });
    const indexPutMappingResult = await esClient.indices.putMapping({
      index: ES_LOCALITY_INDEX_NAME,
      body: indexBody.mappings,
    });
    logger({ indexPutMappingResult });
    const indexOpenResult = await esClient.indices.open({
      index: ES_LOCALITY_INDEX_NAME,
    });
    logger({ indexOpenResult });
    const refreshResult = await esClient.indices.refresh({
      index: ES_LOCALITY_INDEX_NAME,
    });
    logger({ refreshResult });
  } else {
    logger(`creating index: ${ES_LOCALITY_INDEX_NAME}`);
    const indexCreateResult = await esClient.indices.create({
      index: ES_LOCALITY_INDEX_NAME,
      body: indexBody,
    });
    logger({ indexCreateResult });
  }
}

export async function esConnect(
  esport = ELASTIC_PORT,
  eshost = ELASTIC_HOST,
  interval = 1000,
  timeout = 0,
) {
  // we keep trying to connect, no matter what

  while (true) {
    logger(`trying to reach elastic search on ${eshost}:${esport}...`);
    try {
      const open = await waitPort({
        host: eshost,
        port: esport,
        interval,
        timeout,
      });
      if (open) {
        logger(`...${eshost}:${esport} is reachable`);

        while (true) {
          try {
            // P036: URL-encode credentials so passwords containing URL-reserved
            // chars ('/', '+', '=', ':', '!') don't make `new Client({ node })`
            // throw `TypeError: Invalid URL`. Shared helper used here AND in
            // src/read-shadow.js so the fix cannot drift between paths.
            const node = buildClientNode({
              protocol: ELASTIC_PROTOCOL,
              username: ELASTIC_USERNAME,
              password: ELASTIC_PASSWORD,
              host: eshost,
              port: esport,
            });
            // ADR 033: basic auth (default; credentials embedded in `node`)
            // for self-hosted / local Docker / v1, or IAM/SigV4 when
            // ELASTIC_AUTH_MODE=sigv4 (AWS-managed v2). buildEsClientOptions
            // returns `{ node }` unchanged in the basic path.
            const esClientOptions = buildEsClientOptions({
              authMode: resolveAuthMode(process.env),
              node,
              region: ELASTIC_REGION,
            });
            const esClient = new elasticsearch.Client(esClientOptions);
            logger(
              `connecting elastic search client on ${eshost}:${esport}...`,
            );
            await esClient.ping();
            logger(`...connected to ${eshost}:${esport}`);
            globalThis.esClient = esClient;
            return esClient;
          } catch (error_) {
            error(
              `An error occurred while trying to connect the elastic search client on ${eshost}:${esport}`,
              error_,
            );
            await new Promise((resolve) => {
              setTimeout(() => resolve(), interval);
            });
            logger('retrying...');
          }
        }
      }
    } catch (error_) {
      error(
        `An error occured while waiting to reach elastic search on ${eshost}:${esport}`,
        error_,
      );
      await new Promise((resolve) => {
        setTimeout(() => resolve(), interval);
      });
      logger('retrying...');
    }
  }
}
