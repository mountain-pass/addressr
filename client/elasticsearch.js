const waitPort = require('wait-port');
const elasticsearch = require('elasticsearch');
import debug from 'debug';
const logger = debug('api');
const error = debug('error');

const ES_INDEX_NAME = process.env.ES_INDEX_NAME || 'addressr';
const ELASTIC_PORT = parseInt(process.env.ELASTIC_PORT || '9200');
const ELASTIC_HOST = process.env.ELASTIC_HOST || '127.0.0.1';

export async function initIndex(esClient, clear) {
  if (await esClient.indices.exists({ index: ES_INDEX_NAME })) {
    if (clear) {
      await esClient.indices.delete({ index: ES_INDEX_NAME });
    }
  }
  logger('checking if index exists');
  const exists = await esClient.indices.exists({ index: ES_INDEX_NAME });
  logger('index exists:', exists);

  if (!exists) {
    await esClient.indices.create({
      index: ES_INDEX_NAME,
      body: {
        // max_result_window: 8196,
        // max_inner_result_window: 128,
        // max_rescore_window: 8196,
        // max_docvalue_fields_search: 128,
        // settings: {
        //   analysis: {
        //     filter: {
        //       english_poss_stemmer: {
        //         type: 'stemmer',
        //         name: 'possessive_english',
        //       },
        //       edge_ngram: {
        //         type: 'edgeNGram',
        //         min_gram: '2',
        //         max_gram: '25',
        //         token_chars: ['letter', 'digit'],
        //       },
        //     },
        //     analyzer: {
        //       edge_ngram_analyzer: {
        //         filter: ['uppercase', 'english_poss_stemmer', 'edge_ngram'],
        //         tokenizer: 'standard',
        //       },
        //       keyword_analyzer: {
        //         filter: ['lowercase', 'english_poss_stemmer'],
        //         tokenizer: 'standard',
        //       },
        //     },
        //   },
        // },

        settings: {
          index: {
            analysis: {
              analyzer: {
                default: {
                  tokenizer: 'my_tokenizer',
                  filter: ['lowercase', 'asciifolding'],
                },
                synonym: {
                  tokenizer: 'my_tokenizer',
                  filter: ['lowercase', 'synonym'],
                },
                my_analyzer: {
                  tokenizer: 'my_tokenizer',
                  filter: ['lowercase', 'asciifolding'],
                },
              },
              tokenizer: {
                my_tokenizer: {
                  type: 'edge_ngram',
                  min_gram: 3,
                  max_gram: 15,
                  //token_chars: ['letter', 'digit'],
                },
              },
              filter: {
                synonym: {
                  type: 'synonym',
                  lenient: true,
                  synonyms: [
                    'SUPER, super, superannuation',
                    'SMSF, smsf, self-managed superannuation funds, self managed superannuation funds',
                  ],
                },
              },
            },
          },
        },
        aliases: {},
        mappings: {
          // properties: {
          //   sla: {
          //     type: 'search_as_you_type',
          //   },
          // },
          properties: {
            sla: {
              // search_analyzer: 'keyword_analyzer',
              type: 'text',
              analyzer: 'my_analyzer',
            },
            ssla: {
              // search_analyzer: 'keyword_analyzer',
              type: 'text',
              analyzer: 'my_analyzer',
            },
          },
        },
      },
    });
  }
  await esClient.indices.get({ index: ES_INDEX_NAME, includeDefaults: true });
}

export async function esConnect(
  esport = ELASTIC_PORT,
  eshost = ELASTIC_HOST,
  interval = 1000,
  timeout = 0,
) {
  // we keep trying to connect, no matter what
  // eslint-disable-next-line no-constant-condition
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

        // eslint-disable-next-line no-constant-condition
        while (true) {
          try {
            const esClient = new elasticsearch.Client({
              host: `${eshost}:${esport}`,
              log: 'info',
            });
            logger(
              `connecting elastic search client on ${eshost}:${esport}...`,
            );
            await esClient.ping({
              requestTimeout: interval,
              maxRetries: 0,
            });
            logger(`...connected to ${eshost}:${esport}`);
            global.esClient = esClient;
            return esClient;
          } catch (err) {
            error(
              `An error occured while trying to connect the elastic search client on ${eshost}:${esport}`,
              err,
            );
            await new Promise(resolve => {
              setTimeout(() => resolve(), interval);
            });
            logger('retrying...');
          }
        }
      }
    } catch (err) {
      error(
        `An error occured while waiting to reach elastic search on ${eshost}:${esport}`,
        err,
      );
      await new Promise(resolve => {
        setTimeout(() => resolve(), interval);
      });
      logger('retrying...');
    }
  }
}
