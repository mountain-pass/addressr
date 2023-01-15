//import connect from 'connect';
import debug from 'debug'
import express from 'express'
import { createServer } from 'http'
import { WayCharter } from '@mountainpass/waycharter'
import { searchForAddress, getAddress } from '../service/address-service'
import { version } from '../version'
import crypto from 'crypto'

var app = express()

const ONE_DAY = 60 * 60 * 24
const ONE_WEEK = ONE_DAY * 7

var serverPort = process.env.PORT || 8080
var logger = debug('api')
var error = debug('error')
error.log = console.error.bind(console) // eslint-disable-line no-console

let server

const PAGE_SIZE = process.env.PAGE_SIZE || 8

export function startRest2Server() {
  app.use((_request, response, next) => {
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

  const waycharter = new WayCharter()
  app.use(waycharter.router)

  const addressesType = waycharter.registerCollection({
    itemPath: '/:pid',
    itemLoader: async ({ pid }) => {
      const { json, hash, statusCode } = await getAddress(pid)

      return {
        body: json,
        headers: {
          etag: `"${version}-${hash}"`,
          'cache-control': `public, max-age=${ONE_WEEK}`
        },
        status: statusCode || 200
      }
    },
    collectionPath: '/addresses',
    collectionLoader: async ({ page, q }) => {
      if (q && q.length > 2) {
        const foundAddresses = await searchForAddress(q, page + 1, PAGE_SIZE)
        const body = foundAddresses.body.hits.hits.map(h => {
          return {
            sla: h._source.sla,
            ...(h._source.ssla && { ssla: h._source.ssla }),
            highlight: {
              sla: h.highlight.sla[0],
              ...(h.highlight.ssla && { ssla: h.highlight.ssla[0] })
            },
            score: h._score,
            pid: h._id.replace('/addresses/', '')
          }
        })
        const responseHash = crypto
          .createHash('md5')
          .update(JSON.stringify(body))
          .digest('hex')
        return {
          body,
          hasMore: page < foundAddresses.body.hits.total.value / PAGE_SIZE - 1,
          headers: {
            etag: `"${version}-${responseHash}"`,
            'cache-control': `public, max-age=${ONE_WEEK}`
          }
        }
      } else {
        // If-None-Match
        return {
          body: [],
          hasMore: false,
          headers: {
            etag: `"${version}"`,
            'cache-control': `public, max-age=${ONE_WEEK}`
          }
        }
      }
    },
    filters: [
      {
        rel: 'https://addressr.io/rels/address-search',
        parameters: ['q']
      }
    ]
  })

  const index = waycharter.registerResourceType({
    path: '/',
    loader: async () => {
      return {
        body: {},
        links: addressesType.additionalPaths,
        headers: {
          etag: `"${version}"`,
          'cache-control': `public, max-age=${ONE_WEEK}`
        }
      }
    }
  })

  server = createServer(app)
  return new Promise(resolve => {
    server.listen(serverPort, function () {
      logger(
        '📡  Addressr is listening on port %d ( http://localhost:%d ) ',
        serverPort,
        serverPort
      )
      resolve(`http://localhost:${serverPort}`)
    })
  })
}

export function stopServer() {
  if (server !== undefined) {
    server.close()
  }
}
