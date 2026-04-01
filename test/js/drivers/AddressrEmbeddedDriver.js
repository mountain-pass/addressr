import { PendingError } from '@windyroad/cucumber-js-throwables'
import debug from 'debug'
import { JsonPointer } from 'json-ptr'
import { URI } from 'uri-template-lite'
import { getAddress, getAddresses } from '../../../service/address-service'
import { getApiRoot } from '../../../service/DefaultService'
import { swaggerDoc as swaggerDocument } from '../../../swagger'
import { AddressrDriver } from './AddressrDriver'

const logger = debug('api')
const error = debug('error')

function getSwagger (uri) {
  return {
    path: swaggerDocument.paths[uri]
  }
}
export class AddressrEmbeddedDriver extends AddressrDriver {
  async getApiRoot () {
    return getApiRoot()
  }

  async getApi (path) {
    return this.follow({ uri: path })
  }

  async follow (link) {
    logger('FOLLOWING', link)
    switch (link.uri) {
      case '/api-docs':
        return {
          json: swaggerDocument,
          headers: { 'content-type': 'application/json' }
        }
      case '/':
        return getApiRoot()
      case '/addresses':
        return getAddresses(link.uri, getSwagger(link.uri))
      default: {
        if (link.uri.startsWith('/addresses?')) {
          const url = new URL(
            link.uri,
            `http://localhost:${process.env.PORT || 8080}`
          )
          logger('searchParams', url.searchParams)
          logger(
            "parseInt(url.searchParams.get('p') || 1)",
            Number.parseInt(url.searchParams.get('p') || 1)
          )
          const query = url.searchParams.get('q')
          return getAddresses(
            url.pathname,
            getSwagger(url.pathname),
            query == undefined ? undefined : query,
            Number.parseInt(url.searchParams.get('p') || 1)
          )
        } else if (link.uri.startsWith('/addresses/')) {
          var template = new URI.Template('/addresses/{address_id}')
          const parameters = template.match(link.uri)
          logger(parameters)
          try {
            return await getAddress(parameters.address_id)
          } catch (error_) {
            error({ error_ })
            if (error_.code === 'ENOENT') {
              throw new PendingError('Not Found')
            }
            throw new PendingError('501')
          }
        }
        throw new PendingError(link.uri)
      }
    }
  }

  async followVarBase (link) {
    logger('FOLLOWING VAR BASE', link['var-base'])
    const url = new URL(
      link['var-base'],
      `http://localhost:${process.env.PORT || 8080}`
    )
    if (url.pathname === '/api-docs') {
      logger(url)
      const jsonPtr = JsonPointer.create(url.hash)
      return { json: jsonPtr.get(swaggerDocument) }
    } else {
      throw new PendingError(url.pathname)
    }
  }
}
