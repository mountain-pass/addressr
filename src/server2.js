import debug from 'debug';
import { esConnect } from '../client/elasticsearch';
import { printVersion } from '../service/print-version';
import { startRest2Server } from './waycharter-server';

const logger = debug('api');

startRest2Server()
  .then(async () => {
    logger('connecting es client');
    const esClient = await esConnect();
    globalThis.esClient = esClient;
    logger('es client connected');

    console.log('=======================');
    console.log('Addressr - API Server 2');
    console.log('=======================');

    printVersion();
  })
  .catch((error) => {
    console.error('Failed to start server:', error);
    throw error;
  });
