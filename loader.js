import CFonts from 'cfonts';
import debug from 'debug';
import { esConnect } from './client/elasticsearch';
import { mongoConnect } from './client/mongo';
import { loadGnaf } from './service/AddressService';
import { authenticate } from './service/Auth';
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
      CFonts.say('Addressr|API|Server', bannerOptions);

      const smallBannerOptions = {
        font: 'console',
        align: 'center',
        colors: ['yellowBright', 'blue'],
        background: 'blue',
        letterSpacing: 1,
        lineHeight: 1,
        space: true,
        maxLength: '0',
      };
      if (auth) {
        CFonts.say(
          `Version: ${process.env.VERSION || '1.0.0'}|Licensed To: ${
            auth.profile.name
          }|Environment: ${process.env.NODE_ENV || 'development'}`,
          smallBannerOptions,
        );
      } else {
        CFonts.say(
          `Version: ${process.env.VERSION || '1.0.0'}|Environment: ${process.env
            .NODE_ENV || 'development'}`,
          smallBannerOptions,
        );
        CFonts.say(`Unauthenticated`, {
          font: 'console',
          align: 'center',
          colors: ['yellowBright', 'blue'],
          background: 'red',
          letterSpacing: 1,
          lineHeight: 1,
          space: true,
          maxLength: '0',
        });
      }
    })
    .then(loadGnaf)
    .then(() => {
      logger('data loaded');
    })
    .then(global.mongoClient.close)
    .then(() => {
      const end = process.hrtime(start);
      logger(`Execution time: ${end[0]}s ${end[1] / 1000000}ms`);
    })
    .catch(err => {
      error('error loading data', err);
      throw err;
    });
});
