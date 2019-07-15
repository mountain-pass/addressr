import debug from 'debug';
import { createServer } from 'http';
import ngrok from 'ngrok';
import { swaggerInit } from './swagger';

var logger = debug('api');
var error = debug('error');
var serverPort = process.env.PORT || 8080;
error.log = console.error.bind(console); // eslint-disable-line no-console

swaggerInit().then(({ app, middleware }) => {
  logger(app);
  logger(middleware);

  createServer(app).listen(serverPort, function() {
    logger(
      '📡  Addressr is listening on port %d (http://localhost:%d) ',
      serverPort,
      serverPort,
    );
    logger(
      '📑  Swagger-ui is available on http://localhost:%d/docs',
      serverPort,
    );
    if (process.env.NODE_ENV !== 'PRODUCTION') {
      ngrok.connect(serverPort).then(url => {
        logger('📡  Addressr is listening at %s', url);
        logger('📑  Swagger-ui is available on %s/docs/', url);
      });
    }
  });
});
