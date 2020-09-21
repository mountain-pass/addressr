import { PendingError } from '@windyroad/cucumber-js-throwables';
import debug from 'debug';
import { JsonPointer } from 'json-ptr';
import { URI } from 'uri-template-lite';
import { getAddress, getAddresses } from '../../../service/AddressService';
import { getApiRoot } from '../../../service/DefaultService';
import { swaggerDoc } from '../../../swagger';
import { AddressrDriver } from './AddressrDriver';

const logger = debug('api');
const error = debug('error');

function getSwagger(uri) {
  return {
    path: swaggerDoc.paths[uri],
  };
}
export class AddressrEmbeddedDriver extends AddressrDriver {
  async getApiRoot() {
    return getApiRoot();
  }

  async follow(link) {
    logger('FOLLOWING', link);
    switch (link.uri) {
      case '/api-docs':
        return {
          json: swaggerDoc,
          headers: { 'content-type': 'application/json' },
        };
      case '/':
        return getApiRoot();
      case '/addresses':
        return getAddresses(
          link.uri,
          getSwagger(link.uri),
          undefined,
          undefined
        );
      default: {
        if (link.uri.startsWith('/addresses?')) {
          const url = new URL(
            link.uri,
            `http://localhost:${process.env.PORT || 8080}`
          );
          logger('searchParams', url.searchParams);
          logger(
            "parseInt(url.searchParams.get('p') || 1)",
            parseInt(url.searchParams.get('p') || 1)
          );
          const query = url.searchParams.get('q');
          return getAddresses(
            url.pathname,
            getSwagger(url.pathname),
            query == null ? undefined : query,
            parseInt(url.searchParams.get('p') || 1)
          );
        } else if (link.uri.startsWith('/addresses/')) {
          var template = new URI.Template('/addresses/{address_id}');
          const params = template.match(link.uri);
          logger(params);
          try {
            return await getAddress(params.address_id);
          } catch (err) {
            error(JSON.stringify(err));
            if (err.code === 'ENOENT') {
              throw new PendingError('Not Found');
            }
            throw new PendingError('501');
          }
        }
        throw new PendingError(link.uri);
      }
    }
  }

  async followVarBase(link) {
    logger('FOLLOWING VAR BASE', link['var-base']);
    const url = new URL(
      link['var-base'],
      `http://localhost:${process.env.PORT || 8080}`
    );
    if (url.pathname === '/api-docs') {
      logger(url);
      const jsonPtr = JsonPointer.create(url.hash);
      return { json: jsonPtr.get(swaggerDoc) };
    } else {
      throw new PendingError(url.pathname);
    }
  }
}
