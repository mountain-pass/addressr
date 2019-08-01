import debug from 'debug';
import { esConnect } from './client/elasticsearch';
import { mongoConnect } from './client/mongo';
import { loadGnaf } from './service/AddressService';
const logger = debug('api');
const error = debug('error');

const start = process.hrtime();
esConnect()
  .then(() => {
    logger('es client connected');
  })
  .then(mongoConnect)
  .then(() => {
    logger('mongo client connected');
  })
  .then(loadGnaf)
  .then(() => {
    logger('data loaded');
  })
  .then(() => {
    return global.mongoClient.close();
  })
  .then(() => {
    const end = process.hrtime(start);
    logger(`Execution time: ${end[0]}s ${end[1] / 1000000}ms`);
  })
  .catch(err => {
    error('error loading data', err);
    throw err;
  });
