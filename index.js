import connect from 'connect';
import debug from 'debug';
import { readFileSync } from 'fs';
import { createServer } from 'http';
import { safeLoad } from 'js-yaml';
import ngrok from 'ngrok';
import { join } from 'path';
import { initializeMiddleware } from 'swagger-tools';

var logger = debug('api');
var error = debug('error');
var app = connect();
var serverPort = process.env.PORT || 8080;
error.log = console.error.bind(console); // eslint-disable-line no-console

// swaggerRouter configuration
var options = {
  swaggerUi: join(__dirname, '/swagger.json'),
  controllers: join(__dirname, './controllers'),
  useStubs: process.env.NODE_ENV === 'development', // Conditionally turn on stubs (mock mode)
};

// The Swagger document (require it, build it programmatically, fetch it from a URL, ...)
var spec = readFileSync(join(__dirname, 'api/swagger.yaml'), 'utf8');
var swaggerDoc = safeLoad(spec);

// Initialize the Swagger middleware
initializeMiddleware(swaggerDoc, function(middleware) {
  // Interpret Swagger resources and attach metadata to request - must be first in swagger-tools middleware chain
  app.use(middleware.swaggerMetadata());

  // Validate Swagger requests
  app.use(middleware.swaggerValidator());

  // Route validated requests to appropriate controller
  app.use(middleware.swaggerRouter(options));

  // Serve the Swagger documents and Swagger UI
  app.use(middleware.swaggerUi());

  // Start the server
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
        logger('📑  Swagger-ui is available on %s/docs', url);
      });
    }
  });
});
