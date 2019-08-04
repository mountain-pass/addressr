import CFonts from 'cfonts';
import debug from 'debug';
import { esConnect } from './client/elasticsearch';
import { mongoConnect } from './client/mongo';
import { authenticate } from './service/Auth';
import { startServer } from './swagger';

const logger = debug('api');

authenticate().then(auth => {
  startServer().then(() => {
    logger('connecting es client');
    const p1 = esConnect().then(esClient => {
      global.esClient = esClient;
      logger('es client connected');
    });
    logger('connecting mongo client');
    const p2 = mongoConnect().then(() => {
      logger('mongo client connected');
    });
    Promise.all([p1, p2]).then(() => {
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
    });
  });
});
