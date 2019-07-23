const waitPort = require('wait-port');
const elasticsearch = require('elasticsearch');
import debug from 'debug';
const logger = debug('api');
const error = debug('error');

async function initIndex(esClient, index, clear) {
  if (await esClient.indices.exists({ index })) {
    if (clear) {
      await esClient.indices.delete({ index });
    }
  }
  logger('checking if index exists');
  const exists = await esClient.indices.exists({ index });
  logger('index exists:', exists);

  if (!exists) {
    await esClient.indices.create({
      index,
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
          },
        },
      },
    });
  }
  await esClient.indices.get({ index, includeDefaults: true });
}

module.exports = function(
  esport,
  eshost,
  esnode,
  esstart,
  esindex,
  clearindex,
) {
  // logger('ESSTART', esstart);
  // if (esstart == 1) {
  //   logger('spawning elasticsearch');
  //   const child = spawn('elasticsearch', [
  //     '-Ecluster.name=adviserHub',
  //     `-Enode.name=${esnode}`,
  //     `-Ehttp.port=${esport}`,
  //     `-Enetwork.host=${eshost}`,
  //   ]);

  //   child.on('exit', function(code, signal) {
  //     console.error(
  //       'elasticsearch process exited with ' +
  //         `code ${code} and signal ${signal}`,
  //     );
  //     process.exit(1);
  //   });

  //   child.on('error', function(error) {
  //     console.error(`elasticsearch could not be started: ${error}`);
  //     process.exit(2);
  //   });
  //   child.stdout.pipe(process.stdout);
  //   child.stderr.pipe(process.stderr);
  // }
  logger('waiting for elaticsearch to finish starting...');

  return waitPort({
    host: eshost,
    port: esport,
  })
    .then(async open => {
      if (open) {
        logger('...elasticsearch has started');

        // eslint-disable-next-line no-constant-condition
        while (true) {
          try {
            const esClient = new elasticsearch.Client({
              host: `${eshost}:${esport}`,
              log: 'info',
            });
            esClient.index;
            logger('connecting internal esclient...');
            await esClient.ping({
              requestTimeout: 30000,
            });
            logger('...connected');

            await initIndex(esClient, esindex, clearindex);

            return esClient;
          } catch (e) {
            error(
              `An error occured while waiting for elasticseach on port: ${e}`,
            );
            logger('retrying...');
            await new Promise(resolve => {
              // eslint-disable-next-line no-undef
              setTimeout(() => resolve(), 1000);
            });
          }
        }
      }
    })
    .catch(err => {
      console.error(
        `An unknown error occured while waiting for elasticseach on port: ${err}`,
      );
      process.exit(1);
    });
};
