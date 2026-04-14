import debug from 'debug';
import { esConnect } from './client/elasticsearch';
import { loadGnaf } from './service/address-service';
import { printVersion } from './service/print-version';
const logger = debug('api');
const error = debug('error');

if (process.env.DEBUG == undefined) {
  debug.enable('api,error');
}

const start = process.hrtime();
esConnect()
  .then(() => {
    return logger('es client connected');
  })
  .then(() => {
    console.log('======================');
    console.log('Addressr - Data Loader');
    console.log('======================');
    return printVersion();
  })
  .then(loadGnaf)
  .then(() => {
    return logger('data loaded');
  })
  .then(() => {
    const end = process.hrtime(start);
    return logger(`Execution time: ${end[0]}s ${end[1] / 1_000_000}ms`);
  })
  .then(() => {
    logger(`Fin`);
    process.exit(); // eslint-disable-line unicorn/no-process-exit, n/no-process-exit, no-process-exit -- CLI loader entry point
  })
  .catch((error_) => {
    error('error loading data', error_);
    throw error_;
  });
