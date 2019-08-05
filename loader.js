import CFonts from 'cfonts';
import debug from 'debug';
import { esConnect } from './client/elasticsearch';
import { mongoConnect } from './client/mongo';
import { loadGnaf } from './service/AddressService';
import { authenticate, printAuthStatus } from './service/Auth';
const logger = debug('api');
const error = debug('error');

authenticate().then(auth => {
  const start = process.hrtime();
  esConnect()
    .then(() => {
      logger('es client connected');
    })
    .then(mongoConnect)
    .then(() => {
      logger('mongo client connected');
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

      printAuthStatus(auth);
    })
    .then(loadGnaf)
    .then(() => {
      logger('data loaded');
    })
    .then(() => {
      logger('closing mongoClient conection');
      const p = global.mongoClient.close();
      return p;
    })
    .then(() => {
      const end = process.hrtime(start);
      logger(`Execution time: ${end[0]}s ${end[1] / 1000000}ms`);
    })
    .catch(err => {
      error('error loading data', err);
      throw err;
    });
});
