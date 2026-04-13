import debug from 'debug';
import { esConnect } from './client/elasticsearch';
import { printVersion } from './service/print-version';
import { startServer } from './swagger';

const logger = debug('api');

startServer().then(() => {
  logger('connecting es client');
  const p1 = esConnect().then((esClient) => {
    globalThis.esClient = esClient;
    logger('es client connected');
  });
  p1.then(() => {
    console.log('=====================');
    console.log('Addressr - API Server');
    console.log('=====================');

    printVersion();
  });
});
