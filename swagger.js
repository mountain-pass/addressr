//import connect from 'connect';
import debug from 'debug'
import express from 'express'
import { readFileSync } from 'fs'
import { createServer } from 'http'
import { safeLoad } from 'js-yaml'
import pathUtil from 'path'
import { initializeMiddleware } from 'swagger-tools'

var app = express()

var serverPort = process.env.PORT || 8080
var logger = debug('api')
var error = debug('error')
error.log = console.error.bind(console) // eslint-disable-line no-console

// swaggerRouter configuration
var options = {
  swaggerUi: pathUtil.join(__dirname, '/swagger.json'),
  controllers: pathUtil.join(__dirname, './controllers'),
  useStubs: process.env.NODE_ENV === 'development' // Conditionally turn on stubs (mock mode)
}

// The Swagger document (require it, build it programmatically, fetch it from a URL, ...)
var spec = readFileSync(pathUtil.join(__dirname, 'api/swagger.yaml'), 'utf8')
export var swaggerDoc = safeLoad(spec)

global.swaggerDoc = swaggerDoc

export function swaggerInit () {
  // Initialize the Swagger middleware
  return new Promise(resolve => {
    initializeMiddleware(swaggerDoc, function (middleware) {
      // Interpret Swagger resources and attach metadata to request - must be first in swagger-tools middleware chain
      const metaData = middleware.swaggerMetadata()
      app.use(metaData)

      // Validate Swagger requests
      app.use(
        middleware.swaggerValidator({
          validateResponse:
            process.env.NODE_ENV === undefined ||
            process.env.NODE_ENV === 'development'
        })
      )

      // Route validated requests to appropriate controller
      app.use(middleware.swaggerRouter(options))

      // Serve the Swagger documents and Swagger UI
      app.use(
        middleware.swaggerUi({
          // apiDocs: '/api-docs',
          // swaggerUi: '/docs',
        })
      )

      app.use(function (error_, request, res, next) {
        if (error_.failedValidation) {
          // handle validation errror
          const rehydratedError = Object.assign({}, error_)
          if (error_.originalResponse) {
            rehydratedError.originalResponse = JSON.parse(
              error_.originalResponse
            )
          }
          if (error_.message) {
            rehydratedError.message = error_.message
          }
          if (error_.results) {
            rehydratedError.errors = error_.results.errors
            delete rehydratedError.results
          }
          error(
            'error!!!',
            error_.message,
            JSON.stringify(rehydratedError, undefined, 2)
          )
          res
            .status(error_.code === 'SCHEMA_VALIDATION_FAILED' ? '500' : '400')
            .json(rehydratedError)
        } else {
          next()
        }
      })

      global.swaggerApp = app
      global.swaggerMiddleware = middleware
      resolve({ app, middleware })
    })
  })
}

let server

export function startServer () {
  app.use((request, response, next) => {
    if (process.env.ADDRESSR_ACCESS_CONTROL_ALLOW_ORIGIN !== undefined) {
      response.append(
        'Access-Control-Allow-Origin',
        process.env.ADDRESSR_ACCESS_CONTROL_ALLOW_ORIGIN
      )
    }
    if (process.env.ADDRESSR_ACCESS_CONTROL_EXPOSE_HEADERS !== undefined) {
      response.append(
        'Access-Control-Expose-Headers',
        process.env.ADDRESSR_ACCESS_CONTROL_EXPOSE_HEADERS
      )
    }

    next()
  })

  return swaggerInit().then(({ app /*, middleware*/ }) => {
    // logger(app);
    // logger(middleware);

    server = createServer(app)
    server.listen(serverPort, function () {
      logger(
        '📡  Addressr is listening on port %d ( http://localhost:%d ) ',
        serverPort,
        serverPort
      )
      logger(
        '📑  Swagger-ui is available on http://localhost:%d/docs',
        serverPort
      )
      if (process.env.NODE_ENV !== 'PRODUCTION') {
        // ngrok.connect(serverPort).then(url => {
        //   logger('📡  Addressr is listening at %s', url);
        //   logger('📑  Swagger-ui is available on %s/docs/', url);
        // });
      }
    })
    return `http://localhost:${serverPort}`
  })
}

export function stopServer () {
  if (server !== undefined) {
    server.close()
  }
}
