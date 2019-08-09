import CFonts from 'cfonts';
import debug from 'debug';
import { esConnect } from './client/elasticsearch';
import { mongoConnect } from './client/mongo';
import { authenticate, printAuthStatus } from './service/Auth';
import { initMonitoring } from './service/Monitoring';
import { startServer } from './swagger';

const logger = debug('api');

authenticate().then(auth => {
  initMonitoring('server', auth)
    .then(() => {
      return startServer();
    })
    .then(() => {
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

        printAuthStatus(auth);
      });
    });
});
