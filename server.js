import debug from 'debug';
import { esConnect } from './client/elasticsearch';
import { mongoConnect } from './client/mongo';
import { startServer } from './swagger';

const logger = debug('api');

startServer().then(() => {
  logger('connecting es client');
  esConnect().then(esClient => {
    global.esClient = esClient;
    logger('es client connected');
  });
  logger('connecting mongo client');
  mongoConnect().then(() => {
    logger('mongo client connected');
  });
});
