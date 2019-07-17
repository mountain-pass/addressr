const waitPort = require('wait-port');
const elasticsearch = require('elasticsearch');
import debug from 'debug';
const logger = debug('api');

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
        mappings: {
          properties: {
            sla: {
              type: 'text',
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

        const esClient = new elasticsearch.Client({
          host: `${eshost}:${esport}`,
          log: 'info',
        });

        logger('connecting internal esclient...');
        await esClient.ping({
          requestTimeout: 30000,
        });
        logger('...connected');

        await initIndex(esClient, esindex, clearindex);

        return esClient;
      }
      console.error(
        `Timeout while waiting for elasticseach on port: ${esport}`,
      );
      process.exit(1);
    })
    .catch(err => {
      console.error(
        `An unknown error occured while waiting for elasticseach on port: ${err}`,
      );
      process.exit(1);
    });
};
