import { PendingError } from '@windyroad/cucumber-js-throwables';
import debug from 'debug';
import { getAddresses } from '../../../service/AddressService';
import { getApiRoot } from '../../../service/DefaultService';
import { swaggerDoc } from '../../../swagger';
import { AddressrDriver } from './AddressrDriver';
const logger = debug('api');

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
        return getAddresses(link.uri, getSwagger(link.uri));
      default:
        throw new PendingError();
    }
  }
}
