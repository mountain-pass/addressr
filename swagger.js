//import connect from 'connect';
import debug from 'debug';
import express from 'express';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { load } from 'js-yaml';
import pathUtil from 'node:path';
import { initializeMiddleware } from 'swagger-tools';

var app = express();

var serverPort = process.env.PORT || 8080;
var logger = debug('api');
var error = debug('error');
error.log = console.error.bind(console);

// swaggerRouter configuration
var options = {
  swaggerUi: pathUtil.join(__dirname, '/swagger.json'),
  controllers: pathUtil.join(__dirname, './controllers'),
  useStubs: process.env.NODE_ENV === 'development', // Conditionally turn on stubs (mock mode)
};

// The Swagger document (require it, build it programmatically, fetch it from a URL, ...)
var spec = readFileSync(pathUtil.join(__dirname, 'api/swagger.yaml'), 'utf8');
export var swaggerDocument = load(spec);

globalThis.swaggerDocument = swaggerDocument;

export function swaggerInit() {
  // Initialize the Swagger middleware
  return new Promise((resolve) => {
    initializeMiddleware(swaggerDocument, function (middleware) {
      // Interpret Swagger resources and attach metadata to request - must be first in swagger-tools middleware chain
      const metaData = middleware.swaggerMetadata();
      app.use(metaData);

      // Validate Swagger requests
      app.use(
        middleware.swaggerValidator({
          validateResponse:
            process.env.NODE_ENV === undefined ||
            process.env.NODE_ENV === 'development',
        }),
      );

      // Route validated requests to appropriate controller
      app.use(middleware.swaggerRouter(options));

      // Serve the Swagger documents and Swagger UI
      app.use(
        middleware.swaggerUi({
          // apiDocs: '/api-docs',
          // swaggerUi: '/docs',
        }),
      );

      app.use(function (error_, request, response, next) {
        if (error_.failedValidation) {
          // handle validation errror
          const rehydratedError = Object.assign({}, error_);
          if (error_.originalResponse) {
            rehydratedError.originalResponse = JSON.parse(
              error_.originalResponse,
            );
          }
          if (error_.message) {
            rehydratedError.message = error_.message;
          }
          if (error_.results) {
            rehydratedError.errors = error_.results.errors;
            delete rehydratedError.results;
          }
          error(
            'error!!!',
            error_.message,
            JSON.stringify(rehydratedError, undefined, 2),
          );
          response
            .status(error_.code === 'SCHEMA_VALIDATION_FAILED' ? '500' : '400')
            .json(rehydratedError);
        } else {
          next();
        }
      });

      globalThis.swaggerApp = app;
      globalThis.swaggerMiddleware = middleware;
      resolve({ app, middleware });
    });
  });
}

let server;

export function startServer() {
  app.use((request, response, next) => {
    if (process.env.ADDRESSR_ACCESS_CONTROL_ALLOW_ORIGIN !== undefined) {
      response.append(
        'Access-Control-Allow-Origin',
        process.env.ADDRESSR_ACCESS_CONTROL_ALLOW_ORIGIN,
      );
    }
    if (process.env.ADDRESSR_ACCESS_CONTROL_EXPOSE_HEADERS !== undefined) {
      response.append(
        'Access-Control-Expose-Headers',
        process.env.ADDRESSR_ACCESS_CONTROL_EXPOSE_HEADERS,
      );
    }
    if (process.env.ADDRESSR_ACCESS_CONTROL_ALLOW_HEADERS !== undefined) {
      response.append(
        'Access-Control-Allow-Headers',
        process.env.ADDRESSR_ACCESS_CONTROL_ALLOW_HEADERS,
      );
    }

    next();
  });

  return swaggerInit().then(({ app /*, middleware*/ }) => {
    // logger(app);
    // logger(middleware);

    server = createServer(app);
    server.listen(serverPort, function () {
      logger(
        '📡  Addressr is listening on port %d ( http://localhost:%d ) ',
        serverPort,
        serverPort,
      );
      logger(
        '📑  Swagger-ui is available on http://localhost:%d/docs',
        serverPort,
      );
    });
    return `http://localhost:${serverPort}`;
  });
}

export function stopServer() {
  if (server !== undefined) {
    server.close();
  }
}
