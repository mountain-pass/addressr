import { PendingError } from '@windyroad/cucumber-js-throwables';
import { getApiRoot } from '../../../service/DefaultService';
import { swaggerDoc } from '../../../swagger';
import { AddressrDriver } from './AddressrDriver';
export class AddressrEmbeddedDriver extends AddressrDriver {
  async getApiRoot() {
    return getApiRoot();
  }

  async follow(link) {
    console.log('FOLLOWING', link);
    switch (link.uri) {
      case '/api-docs':
        return {
          json: swaggerDoc,
          headers: { 'content-type': 'application/json' },
        };
      case '/':
        return getApiRoot();

      default:
        throw new PendingError();
    }
  }
}
