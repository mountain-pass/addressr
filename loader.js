import CFonts from 'cfonts';
import debug from 'debug';
import { esConnect } from './client/elasticsearch';
import { loadGnaf } from './service/address-service';
import { printVersion } from './service/printVersion';
const logger = debug('api');
const error = debug('error');

if (process.env.DEBUG == undefined) {
  debug.enable('api,error');
}

const start = process.hrtime();
esConnect()
  .then(() => {
    logger('es client connected');
  })
  .then(() => {
    const bannerOptions = {
      font: '3d',
      align: 'center',
      colors: ['yellowBright', 'cyan'],
      background: 'transparent',
      letterSpacing: 1,
      lineHeight: 1,
      space: true,
      maxLength: '0',
    };
    CFonts.say('Addressr|Data|Loader', bannerOptions);
    printVersion();
  })
  .then(loadGnaf)
  .then(() => {
    logger('data loaded');
  })
  .then(() => {
    const end = process.hrtime(start);
    logger(`Execution time: ${end[0]}s ${end[1] / 1000000}ms`);
  })
  .then(() => {
    logger(`Fin`);
    process.exit();
  })
  .catch((error_) => {
    error('error loading data', error_);
    throw error_;
  });
