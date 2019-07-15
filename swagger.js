import connect from 'connect';
// import debug from 'debug';
import { readFileSync } from 'fs';
import { safeLoad } from 'js-yaml';
import { join } from 'path';
import { initializeMiddleware } from 'swagger-tools';
// var logger = debug('api');
var app = connect();

// swaggerRouter configuration
var options = {
  swaggerUi: join(__dirname, '/swagger.json'),
  controllers: join(__dirname, './controllers'),
  useStubs: process.env.NODE_ENV === 'development', // Conditionally turn on stubs (mock mode)
};

// The Swagger document (require it, build it programmatically, fetch it from a URL, ...)
var spec = readFileSync(join(__dirname, 'api/swagger.yaml'), 'utf8');
export var swaggerDoc = safeLoad(spec);

global.swaggerDoc = swaggerDoc;

export function swaggerInit() {
  // Initialize the Swagger middleware
  return new Promise(resolve => {
    initializeMiddleware(swaggerDoc, function(middleware) {
      // Interpret Swagger resources and attach metadata to request - must be first in swagger-tools middleware chain
      const metaData = middleware.swaggerMetadata();
      app.use(metaData);

      // Validate Swagger requests
      app.use(middleware.swaggerValidator());

      // Route validated requests to appropriate controller
      app.use(middleware.swaggerRouter(options));

      // Serve the Swagger documents and Swagger UI
      app.use(
        middleware.swaggerUi({
          // apiDocs: '/api-docs',
          // swaggerUi: '/docs',
        }),
      );
      global.swaggerApp = app;
      global.swaggerMiddleware = middleware;
      resolve({ app, middleware });
    });
  });
}
