import debug from 'debug';
import { esConnect } from './client/elasticsearch.js';
import { loadGnaf } from './service/address-service.js';
import { printVersion } from './service/print-version.js';
const logger = debug('api');
const error = debug('error');

if (process.env.DEBUG == undefined) {
  debug.enable('api,error');
}

const start = process.hrtime();
/* eslint-disable unicorn/prefer-await -- This is a top-level entry-point chain, not
   a function body. Converting it to `await` at module top level changes when the
   process settles and how an unhandled rejection surfaces on a CLI whose exit
   code is its contract, for no behavioural gain. The `.catch` at the end is the
   process's error handler. Tracked on P084. */
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
/* eslint-enable unicorn/prefer-await */
